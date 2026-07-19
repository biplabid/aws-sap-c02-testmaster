window.TestMaster = window.TestMaster || {};

window.TestMaster.utils = (function createUtilsModule() {
  function qs(selector, scope = document) {
    return scope.querySelector(selector);
  }

  function qsa(selector, scope = document) {
    return Array.from(scope.querySelectorAll(selector));
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function formatPercent(value) {
    return `${Math.round(clamp(value, 0, 100))}%`;
  }

  return {
    qs,
    qsa,
    clamp,
    formatPercent
  };
})();
