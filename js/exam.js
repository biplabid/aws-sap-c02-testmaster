window.TestMaster = window.TestMaster || {};

window.TestMaster.exam = (function createExamModule() {
  function initExamShell(appState) {
    appState.exam = {
      mode: null,
      status: "idle"
    };
  }

  return {
    initExamShell
  };
})();
