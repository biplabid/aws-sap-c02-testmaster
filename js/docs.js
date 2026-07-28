window.TestMaster = window.TestMaster || {};

window.TestMaster.docs = (function createDocsModule() {
  const DOC_VIEWS = ["guide", "architecture"];
  const observers = new Map();

  function initDocsShell() {
    window.addEventListener("testmaster:view-change", (event) => {
      if (DOC_VIEWS.includes(event.detail.view)) {
        setupScrollSpy(event.detail.view);
      }
    });

    if (DOC_VIEWS.includes(window.TestMaster.ui.getRouteFromHash())) {
      setupScrollSpy(window.TestMaster.ui.getRouteFromHash());
    }
  }

  function setupScrollSpy(viewName) {
    if (observers.has(viewName)) {
      return;
    }

    const view = document.querySelector(`[data-view="${viewName}"]`);
    if (!view) {
      return;
    }

    const toc = view.querySelector(".doc-toc");
    const sections = Array.from(view.querySelectorAll(".doc-section[id]"));

    if (!toc || sections.length === 0) {
      return;
    }

    const setActive = (id) => {
      toc.querySelectorAll("a").forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === `#${id}`);
      });
    };

    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

      if (visible.length > 0) {
        setActive(visible[0].target.id);
      }
    }, {
      rootMargin: "-96px 0px -70% 0px",
      threshold: 0
    });

    sections.forEach((section) => observer.observe(section));
    observers.set(viewName, observer);
    setActive(sections[0].id);
  }

  return {
    initDocsShell
  };
})();
