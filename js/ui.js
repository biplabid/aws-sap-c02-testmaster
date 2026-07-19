window.TestMaster = window.TestMaster || {};

window.TestMaster.ui = (function createUiModule() {
  const THEME_KEY = "sap-c02-testmaster-theme";

  function initNavigation() {
    const navItems = window.TestMaster.utils.qsa("[data-nav]");
    const modeCards = window.TestMaster.utils.qsa(".mode-card[data-nav]");
    const views = window.TestMaster.utils.qsa("[data-view]");
    const sideNav = window.TestMaster.utils.qs(".side-nav");
    const menuToggle = window.TestMaster.utils.qs("#menuToggle");

    const activate = (target) => {
      const viewName = target || "home";

      views.forEach((view) => {
        view.classList.toggle("active", view.dataset.view === viewName);
      });

      navItems.forEach((item) => {
        item.classList.toggle("active", item.dataset.nav === viewName);
      });

      if (sideNav) {
        sideNav.classList.remove("open");
      }

      if (menuToggle) {
        menuToggle.setAttribute("aria-expanded", "false");
      }

      document.title = viewName === "home"
        ? "AWS SAP-C02 TestMaster"
        : `${formatTitle(viewName)} | AWS SAP-C02 TestMaster`;

      window.dispatchEvent(new CustomEvent("testmaster:view-change", {
        detail: {
          view: viewName
        }
      }));
    };

    const allNavLinks = [...navItems, ...modeCards];

    allNavLinks.forEach((item) => {
      item.addEventListener("click", (event) => {
        event.preventDefault();
        const target = item.dataset.nav;
        history.pushState({ view: target }, "", `#${target}`);
        activate(target);
      });
    });

    if (menuToggle && sideNav) {
      document.body.addEventListener("click", (event) => {
        if (!sideNav.contains(event.target) && !menuToggle.contains(event.target) && sideNav.classList.contains("open")) {
          sideNav.classList.remove("open");
          menuToggle.setAttribute("aria-expanded", "false");
        }
      });

      menuToggle.addEventListener("click", () => {
        const isOpen = sideNav.classList.toggle("open");
        menuToggle.setAttribute("aria-expanded", String(isOpen));
      });
    }

    window.addEventListener("popstate", () => {
      activate(getRouteFromHash());
    });

    activate(getRouteFromHash());

    initKeyboardShortcuts(navItems, activate);
  }

  function initTheme({ storage }) {
    const shell = window.TestMaster.utils.qs(".app-shell");
    const themeToggle = window.TestMaster.utils.qs("#themeToggle");
    const savedTheme = storage.get(THEME_KEY, "light");

    if (!shell || !themeToggle) {
      return;
    }

    shell.dataset.theme = savedTheme;

    themeToggle.addEventListener("click", () => {
      const nextTheme = shell.dataset.theme === "dark" ? "light" : "dark";
      shell.dataset.theme = nextTheme;
      storage.set(THEME_KEY, nextTheme);
      window.dispatchEvent(new CustomEvent("testmaster:theme-change", {
        bubbles: true,
        detail: { theme: nextTheme }
      }));
    });
  }

  function showToast(message) {
    const existing = window.TestMaster.utils.qs(".toast");

    if (existing) {
      existing.remove();
    }

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);

    window.setTimeout(() => {
      toast.remove();
    }, 2800);
  }

  function getRouteFromHash() {
    return window.location.hash.replace("#", "") || "home";
  }

  function formatTitle(viewName) {
    const labels = {
      random: "Random Test",
      timed: "Timed Quiz",
      mock: "SAP-C02 Mock Exam",
      stats: "Statistics"
    };

    return labels[viewName] || "Home";
  }

  function initKeyboardShortcuts(navItems, activate) {
    const shortcuts = {
      H: "home",
      R: "random",
      T: "timed",
      M: "mock",
      S: "stats"
    };

    window.addEventListener("keydown", (event) => {
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toUpperCase();
        if (shortcuts[key]) {
          event.preventDefault();
          const targetView = shortcuts[key];
          const navItem = Array.from(navItems).find(item => item.dataset.nav === targetView);
          if (navItem) {
            history.pushState({ view: targetView }, "", `#${targetView}`);
            activate(targetView);
          }
        }
      }
    });
  }

  function getSharedUiElements() {
    const get = (selector) => document.querySelector(selector);
    return {
      meta: (prefix) => get(`#${prefix}QuestionMeta`),
      type: (prefix) => get(`#${prefix}QuestionType`),
      prompt: (prefix) => get(`#${prefix}QuestionPrompt`),
      form: (prefix) => get(`#${prefix}AnswerForm`),
      previous: (prefix) => get(`#${prefix}Previous`),
      next: (prefix) => get(`#${prefix}Next`)
    };
  }

  return {
    initNavigation,
    initTheme,
    showToast,
    getRouteFromHash,
    getSharedUiElements
  };
})();
