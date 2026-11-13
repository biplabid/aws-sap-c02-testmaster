window.TestMaster = window.TestMaster || {};

/**
 * The "Exam Tip" button's panel.
 *
 * Deliberately a different thing from Ask AI Coach: that answers a question at
 * length, this shows one short, memorizable pattern — the trigger phrase in the
 * stem, the service or pattern it maps to, and the trap that makes a distractor
 * tempting. The shape comes from the candidate's own CertTip notes.
 *
 * Tips are looked up from committed data files, so this opens instantly and
 * needs no API key. It shares #aiPanel with the AI Coach rather than adding a
 * second overlay.
 */
window.TestMaster.examTip = (function createExamTipModule(tipLoader) {
  let elements = null;
  let initialized = false;

  function getElements() {
    return {
      backdrop: document.querySelector("#aiPanelBackdrop"),
      panel: document.querySelector("#aiPanel"),
      title: document.querySelector(".ai-panel-title"),
      close: document.querySelector("#aiPanelClose"),
      body: document.querySelector("#aiPanelBody"),
      tip: document.querySelector("#aiPanelTip")
    };
  }

  function initExamTip() {
    if (initialized) {
      return;
    }

    elements = getElements();

    if (!elements.panel || !elements.tip) {
      return;
    }

    initialized = true;

  }

  function openPanel(title) {
    window.TestMaster.aiPanel.openPanel(title);
  }


  /**
   * Hides every section of the shared panel body, so a tip never renders
   * underneath a leftover AI Coach answer and vice versa.
   */

  function clearElement(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function buildRow(labelText, valueText, modifier) {
    const row = document.createElement("div");
    row.className = `exam-tip-row exam-tip-row-${modifier}`;

    const label = document.createElement("span");
    label.className = "exam-tip-label";
    label.textContent = labelText;

    const value = document.createElement("p");
    value.className = "exam-tip-value";
    // textContent, never innerHTML: tip text is model-generated and must not
    // be able to inject markup into the page.
    value.textContent = valueText;

    row.appendChild(label);
    row.appendChild(value);
    return row;
  }

  function renderTip(tip) {
    clearElement(elements.tip);

    const card = document.createElement("div");
    card.className = "exam-tip-card";

    if (tip.needsReview) {
      const flag = document.createElement("div");
      flag.className = "exam-tip-flag";
      flag.textContent = "Unverified — this tip was generated without a source explanation and has not been reviewed.";
      card.appendChild(flag);
    }

    if (tip.trigger) {
      card.appendChild(buildRow("When you see", tip.trigger, "trigger"));
    }
    if (tip.answer) {
      card.appendChild(buildRow("Answer", tip.answer, "answer"));
    }
    if (tip.trap) {
      card.appendChild(buildRow("Trap", tip.trap, "trap"));
    }
    if (tip.memory_hook) {
      card.appendChild(buildRow("Memory hook", tip.memory_hook, "hook"));
    }

    elements.tip.appendChild(card);
  }

  function renderEmpty(message, hint) {
    clearElement(elements.tip);

    const empty = document.createElement("div");
    empty.className = "exam-tip-empty";

    const text = document.createElement("p");
    text.textContent = message;
    empty.appendChild(text);

    if (hint) {
      const small = document.createElement("p");
      small.className = "exam-tip-empty-hint";
      small.textContent = hint;
      empty.appendChild(small);
    }

    elements.tip.appendChild(empty);
  }

  /**
   * Entry point for every Exam Tip button.
   *
   * @param {string|null} setKey     e.g. "set1"; may be null when the id is
   *                                 already namespaced as "set1:14".
   * @param {string|number} questionId
   */
  async function showTipFor(setKey, questionId) {
    if (!initialized || !elements.panel) {
      return;
    }

    openPanel("Exam Tip");
    window.TestMaster.aiPanel.showOnly("aiPanelTip");
    renderEmpty("Looking up tip…");

    let tip = null;
    try {
      tip = await tipLoader.getTip(setKey, questionId);
    } catch (error) {
      renderEmpty("Could not load tips for this set.", String(error && error.message ? error.message : error));
      return;
    }

    if (!tip) {
      renderEmpty(
        "No exam tip has been generated for this question yet.",
        "Tips are generated per question set and committed to the app. Use Ask AI Coach for a full explanation in the meantime."
      );
      return;
    }

    renderTip(tip);
  }

  return {
    initExamTip,
    showTipFor
  };
})(window.TestMaster.tipLoader);
