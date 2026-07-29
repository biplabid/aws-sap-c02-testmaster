window.TestMaster = window.TestMaster || {};

window.TestMaster.aiCoach = (function createAiCoachModule(storage) {
  const API_KEY_STORAGE_KEY = "ai-coach:gemini-api-key";

  let elements = null;
  let currentQuestion = null;
  let initialized = false;

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
      question: document.querySelector("#aiPanelQuestion"),
      keySetup: document.querySelector("#aiPanelKeySetup"),
      keyInput: document.querySelector("#aiPanelKeyInput"),
      keySave: document.querySelector("#aiPanelKeySave"),
      loading: document.querySelector("#aiPanelLoading"),
      error: document.querySelector("#aiPanelError"),
      answer: document.querySelector("#aiPanelAnswer"),
      changeKey: document.querySelector("#aiPanelChangeKey"),
      openGem: document.querySelector("#aiPanelOpenGem")
    };
  }

  function ensureInitialized() {
    if (initialized) {
      return;
    }

    elements = getElements();

    if (!elements.panel) {
      return;
    }

    initialized = true;

    elements.close.addEventListener("click", closePanel);
    elements.backdrop.addEventListener("click", closePanel);

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !elements.panel.classList.contains("hidden")) {
        closePanel();
      }
    });

    elements.keySave.addEventListener("click", () => {
      const key = elements.keyInput.value.trim();
      if (!key) {
        return;
      }
      setApiKey(key);
      askGemini();
    });

    elements.keyInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        elements.keySave.click();
      }
    });

    elements.changeKey.addEventListener("click", () => {
      elements.keyInput.value = getApiKey();
      showOnly("keySetup");
    });

    elements.openGem.href = getConfig().AI_COACH_GEM_URL || "#";
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
  }

  function closePanel() {
    elements.panel.classList.add("hidden");
    elements.backdrop.classList.add("hidden");
  }

  async function askAboutQuestion(question) {
    if (!question) {
      return;
    }

    ensureInitialized();

    if (!elements || !elements.panel) {
      return;
    }

    currentQuestion = question;
    elements.question.textContent = formatQuestionText(question);
    openPanel();

    if (!getApiKey()) {
      elements.keyInput.value = "";
      showOnly("keySetup");
      return;
    }

    await askGemini();
  }

  async function askGemini() {
    const apiKey = getApiKey();

    if (!apiKey || !currentQuestion) {
      showOnly("keySetup");
      return;
    }

    showOnly("loading");

    const config = getConfig();
    const model = config.AI_COACH_MODEL || "gemini-2.5-flash";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: config.AI_COACH_SYSTEM_PROMPT || "" }]
          },
          contents: [
            {
              role: "user",
              parts: [{ text: formatQuestionText(currentQuestion) }]
            }
          ]
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error((data.error && data.error.message) || `Request failed (${response.status}).`);
      }

      const candidate = data.candidates && data.candidates[0];
      const text = candidate && candidate.content && candidate.content.parts
        ? candidate.content.parts.map((part) => part.text || "").join("")
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
    askAboutQuestion
  };
})(window.TestMaster.storage);
