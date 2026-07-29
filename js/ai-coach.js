window.TestMaster = window.TestMaster || {};

window.TestMaster.aiCoach = (function createAiCoachModule(storage) {
  const API_KEY_STORAGE_KEY = "ai-coach:groq-api-key";
  const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

  let elements = null;
  let currentQuestion = null;
  let initialized = false;
  let justOpened = false;

  function getConfig() {
    return window.TestMaster.config || {};
  }

  function getApiKey() {
    return storage.get(API_KEY_STORAGE_KEY, "");
  }

  function setApiKey(key) {
    storage.set(API_KEY_STORAGE_KEY, key);
  }

  function getElements() {
    return {
      backdrop: document.querySelector("#aiPanelBackdrop"),
      panel: document.querySelector("#aiPanel"),
      close: document.querySelector("#aiPanelClose"),
      keySetup: document.querySelector("#aiPanelKeySetup"),
      keyInput: document.querySelector("#aiPanelKeyInput"),
      keySave: document.querySelector("#aiPanelKeySave"),
      loading: document.querySelector("#aiPanelLoading"),
      error: document.querySelector("#aiPanelError"),
      answer: document.querySelector("#aiPanelAnswer"),
      sidebarKeyLink: document.querySelector("#aiCoachKeyLink")
    };
  }

  function initAiCoach() {
    if (initialized) {
      return;
    }

    elements = getElements();

    if (!elements.panel) {
      return;
    }

    initialized = true;

    elements.close.addEventListener("click", closePanel);

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.panel.classList.contains("hidden")) {
        closePanel();
      }
    });

    // The panel reserves its own space rather than covering the page, so
    // there's no full-screen overlay element to catch "click outside" —
    // detect it directly. justOpened skips the very click that opened the
    // panel (still bubbling to document at the point this runs); it's
    // cleared on the next tick, once that bubble phase has finished.
    document.addEventListener("click", (event) => {
      if (justOpened || elements.panel.classList.contains("hidden")) {
        return;
      }
      if (!elements.panel.contains(event.target)) {
        closePanel();
      }
    });

    elements.keySave.addEventListener("click", () => {
      const key = elements.keyInput.value.trim();
      if (!key) {
        return;
      }
      setApiKey(key);

      if (currentQuestion) {
        askGroq();
        return;
      }

      if (window.TestMaster.ui) {
        window.TestMaster.ui.showToast("Groq API key saved.");
      }
      closePanel();
    });

    elements.keyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        elements.keySave.click();
      }
    });

    if (elements.sidebarKeyLink) {
      elements.sidebarKeyLink.addEventListener("click", (event) => {
        event.preventDefault();
        openKeySettings();
      });
    }
  }

  // --- Minimal Markdown renderer -----------------------------------------
  // The Gem's persona always answers with bold keywords, tables, and code/
  // ASCII-diagram blocks, so plain text would show raw "**"/"|---|" syntax.
  // This covers just what that persona actually produces — not general
  // Markdown — and always escapes HTML first so the model's own output
  // can never inject markup into the page.

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function renderInline(escapedText) {
    return escapedText
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");
  }

  function isTableSeparatorRow(line) {
    const cells = splitTableRow(line);
    return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.trim()));
  }

  function splitTableRow(line) {
    const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
    return trimmed.split("|");
  }

  function renderTable(headerLine, rowLines) {
    const headerCells = splitTableRow(headerLine);
    let html = "<table><thead><tr>";
    headerCells.forEach((cell) => {
      html += `<th>${renderInline(cell.trim())}</th>`;
    });
    html += "</tr></thead><tbody>";
    rowLines.forEach((rowLine) => {
      html += "<tr>";
      splitTableRow(rowLine).forEach((cell) => {
        html += `<td>${renderInline(cell.trim())}</td>`;
      });
      html += "</tr>";
    });
    html += "</tbody></table>";
    return html;
  }

  function renderMarkdown(raw) {
    const lines = escapeHtml(raw).split("\n");
    const htmlParts = [];
    let paragraphLines = [];
    let listItems = null; // { tag: "ul"|"ol", items: [] }

    const flushParagraph = () => {
      if (paragraphLines.length) {
        htmlParts.push(`<p>${renderInline(paragraphLines.join(" "))}</p>`);
        paragraphLines = [];
      }
    };

    const flushList = () => {
      if (listItems) {
        const itemsHtml = listItems.items.map((item) => `<li>${renderInline(item)}</li>`).join("");
        htmlParts.push(`<${listItems.tag}>${itemsHtml}</${listItems.tag}>`);
        listItems = null;
      }
    };

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];

      if (/^```/.test(line.trim())) {
        flushParagraph();
        flushList();
        const codeLines = [];
        i += 1;
        while (i < lines.length && !/^```/.test(lines[i].trim())) {
          codeLines.push(lines[i]);
          i += 1;
        }
        htmlParts.push(`<pre><code>${codeLines.join("\n")}</code></pre>`);
        continue;
      }

      if (line.includes("|") && lines[i + 1] && isTableSeparatorRow(lines[i + 1])) {
        flushParagraph();
        flushList();
        const rowLines = [];
        let j = i + 2;
        while (j < lines.length && lines[j].includes("|") && lines[j].trim()) {
          rowLines.push(lines[j]);
          j += 1;
        }
        htmlParts.push(renderTable(line, rowLines));
        i = j - 1;
        continue;
      }

      const headingMatch = line.match(/^(#{1,4})\s+(.*)/);
      if (headingMatch) {
        flushParagraph();
        flushList();
        htmlParts.push(`<h4>${renderInline(headingMatch[2])}</h4>`);
        continue;
      }

      const orderedMatch = line.match(/^\d+\.\s+(.*)/);
      const unorderedMatch = line.match(/^[-*]\s+(.*)/);

      if (orderedMatch || unorderedMatch) {
        flushParagraph();
        const tag = orderedMatch ? "ol" : "ul";
        const itemText = (orderedMatch || unorderedMatch)[1];
        if (!listItems || listItems.tag !== tag) {
          flushList();
          listItems = { tag, items: [] };
        }
        listItems.items.push(itemText);
        continue;
      }

      if (!line.trim()) {
        flushParagraph();
        flushList();
        continue;
      }

      flushList();
      paragraphLines.push(line.trim());
    }

    flushParagraph();
    flushList();

    return htmlParts.join("");
  }

  function formatQuestionText(question) {
    const lines = [question.prompt, ""];

    question.options.forEach((option) => {
      lines.push(`${option.id}. ${option.text}`);
    });

    return lines.join("\n");
  }

  function showOnly(section) {
    const sections = ["keySetup", "loading", "error", "answer"];
    sections.forEach((name) => {
      elements[name].classList.toggle("hidden", name !== section);
    });
  }

  function openPanel() {
    elements.panel.classList.remove("hidden");
    elements.backdrop.classList.remove("hidden");
    document.body.classList.add("ai-panel-open");

    justOpened = true;
    window.setTimeout(() => {
      justOpened = false;
    }, 0);
  }

  function closePanel() {
    elements.panel.classList.add("hidden");
    elements.backdrop.classList.add("hidden");
    document.body.classList.remove("ai-panel-open");
  }

  async function askAboutQuestion(question) {
    if (!question || !elements || !elements.panel) {
      return;
    }

    currentQuestion = question;
    openPanel();

    if (!getApiKey()) {
      elements.keyInput.value = "";
      showOnly("keySetup");
      return;
    }

    await askGroq();
  }

  function openKeySettings() {
    if (!elements || !elements.panel) {
      return;
    }

    currentQuestion = null;
    elements.keyInput.value = getApiKey();
    openPanel();
    showOnly("keySetup");
  }

  async function askGroq() {
    const apiKey = getApiKey();

    if (!apiKey || !currentQuestion) {
      showOnly("keySetup");
      return;
    }

    showOnly("loading");

    const config = getConfig();
    const model = config.AI_COACH_MODEL || "llama-3.3-70b-versatile";

    try {
      const response = await fetch(GROQ_CHAT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: config.AI_COACH_SYSTEM_PROMPT || "" },
            { role: "user", content: formatQuestionText(currentQuestion) }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error((data.error && data.error.message) || `Request failed (${response.status}).`);
      }

      const text = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content || ""
        : "";

      if (!text) {
        throw new Error("AI Coach didn't return an answer for this question.");
      }

      elements.answer.innerHTML = renderMarkdown(text);
      showOnly("answer");
    } catch (error) {
      console.error(error);
      elements.error.textContent = /api key/i.test(error.message)
        ? `${error.message} Check the key and try again.`
        : error.message;
      showOnly("error");
    }
  }

  return {
    initAiCoach,
    askAboutQuestion
  };
})(window.TestMaster.storage);
