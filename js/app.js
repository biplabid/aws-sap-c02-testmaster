(function bootstrapApp() {
  const appState = {};

  appState.questionEngine = window.TestMaster.questionEngine;

  if (window.TestMaster.exam) {
    window.TestMaster.exam.initExamShell(appState);
  }

  if (window.TestMaster.random) {
    window.TestMaster.random.initRandomShell(appState);
  }

  if (window.TestMaster.quiz) {
    window.TestMaster.quiz.initQuizShell(appState);
  }

  if (window.TestMaster.mock) {
    window.TestMaster.mock.initMockShell(appState);
  }

  if (window.TestMaster.analytics) {
    window.TestMaster.analytics.initAnalyticsShell(appState);
  }

  if (window.TestMaster.ui) {
    window.TestMaster.ui.initNavigation();
    window.TestMaster.ui.initTheme({ storage: window.TestMaster.storage });
  }

  window.TestMaster.appState = appState;
})();
