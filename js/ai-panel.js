window.TestMaster = window.TestMaster || {};

/**
 * The single owner of #aiPanel.
 *
 * Both Ask AI Coach and Exam Tip render into this one panel. When each module
 * also registered its own document-level "click outside to close" listener,
 * opening the panel from either button closed it again in the same click: the
 * other module's listener saw an open panel, a click outside it, and its own
 * just-opened guard still false. One owner, one guard, one set of listeners.
 */
window.TestMaster.aiPanel = (function createAiPanelModule() {
  const DEFAULT_TITLE = "AWS SAP-C02 Coach";

  let elements = null;
  let initialized = false;
  let justOpened = false;

  function getElements() {
    return {
      backdrop: document.querySelector("#aiPanelBackdrop"),
      panel: document.querySelector("#aiPanel"),
      title: document.querySelector(".ai-panel-title"),
      close: document.querySelector("#aiPanelClose"),
      body: document.querySelector("#aiPanelBody")
    };
  }

  function initAiPanel() {
    if (initialized) {
      return;
    }

    elements = getElements();

    if (!elements.panel) {
      return;
    }

    initialized = true;

    if (elements.close) {
      elements.close.addEventListener("click", closePanel);
    }

    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && isOpen()) {
        closePanel();
      }
    });

    // The panel reserves its own space rather than covering the page, so
    // there's no full-screen overlay to catch "click outside" — detect it
    // directly. justOpened skips the very click that opened the panel, which
    // is still bubbling to document at the point this runs.
    document.addEventListener("click", (event) => {
      if (justOpened || !isOpen()) {
        return;
      }
      if (!elements.panel.contains(event.target)) {
        closePanel();
      }
    });
  }

  function isOpen() {
    return Boolean(elements && elements.panel && !elements.panel.classList.contains("hidden"));
  }

  function openPanel(title) {
    if (!elements || !elements.panel) {
      return;
    }

    if (elements.title) {
      elements.title.textContent = title || DEFAULT_TITLE;
    }

    elements.panel.classList.remove("hidden");
    elements.backdrop.classList.remove("hidden");
    document.body.classList.add("ai-panel-open");

    justOpened = true;
    window.setTimeout(() => {
      justOpened = false;
    }, 0);
  }

  function closePanel() {
    if (!elements || !elements.panel) {
      return;
    }

    elements.panel.classList.add("hidden");
    elements.backdrop.classList.add("hidden");
    document.body.classList.remove("ai-panel-open");

    if (elements.title) {
      elements.title.textContent = DEFAULT_TITLE;
    }
  }

  /**
   * Shows exactly one section of the panel body and hides the rest, whichever
   * module owns them.
   *
   * @param {string} id element id to reveal, e.g. "aiPanelAnswer"
   */
  function showOnly(id) {
    if (!elements || !elements.body) {
      return;
    }

    Array.prototype.forEach.call(elements.body.children, (child) => {
      child.classList.toggle("hidden", child.id !== id);
    });
  }

  return {
    initAiPanel,
    openPanel,
    closePanel,
    showOnly,
    isOpen
  };
})();
