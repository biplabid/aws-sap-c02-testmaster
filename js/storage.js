window.TestMaster = window.TestMaster || {};

window.TestMaster.storage = (function createStorageModule() {
  const APP_PREFIX = "sap-c02-testmaster:";
  const KEYS = {
    SETTINGS: "settings",
    STATISTICS: "statistics",
    ATTEMPT_HISTORY: "attempt_history",
    SESSION_PREFIX: "session:",
    TIMER_PREFIX: "timer:",
    ANSWERS_PREFIX: "answers:",
    REVIEW_PREFIX: "review:",
    DONE_QUESTIONS_PREFIX: "done_questions:"
  };

  const DEFAULT_STATISTICS = {
    attempts: 0,
    completedQuizAttempts: 0,
    completedMockAttempts: 0,
    totalCorrect: 0,
    totalQuestions: 0,
    bestScore: null,
    averageScore: null,
    studyTimeSeconds: 0,
    lastAttemptAt: null
  };

  function get(key, fallback = null) {
    try {
      const value = window.localStorage.getItem(getKey(key));
      return value === null ? fallback : JSON.parse(value);
    } catch (error) {
      return fallback;
    }
  }

  function set(key, value) {
    try {
      window.localStorage.setItem(getKey(key), JSON.stringify(value));
      return true;
    } catch (error) {
      return false;
    }
  }

  function remove(key) {
    try {
      window.localStorage.removeItem(getKey(key));
      return true;
    } catch (error) {
      return false;
    }
  }

  function saveSettings(settings) {
    return set(KEYS.SETTINGS, {
      ...loadSettings(),
      ...(settings || {}),
      updatedAt: Date.now()
    });
  }

  function loadSettings() {
    return get(KEYS.SETTINGS, {
      theme: "light",
      updatedAt: null
    });
  }

  function saveStatistics(statistics) {
    return set(KEYS.STATISTICS, {
      ...DEFAULT_STATISTICS,
      ...(statistics || {}),
      updatedAt: Date.now()
    });
  }

  function loadStatistics() {
    return {
      ...DEFAULT_STATISTICS,
      ...get(KEYS.STATISTICS, DEFAULT_STATISTICS)
    };
  }

  function recordAttempt(attempt) {
    const statistics = loadStatistics();
    const score = Number(attempt.score) || 0;
    const totalQuestions = Number(attempt.totalQuestions) || 0;
    const correctCount = Number(attempt.correctCount) || 0;
    const studyTimeSeconds = Number(attempt.timeUsedSeconds) || 0;
    const attemptHistory = loadAttemptHistory();
    const attempts = statistics.attempts + 1;
    const totalScore = ((statistics.averageScore || 0) * statistics.attempts) + score;

    const nextStatistics = {
      ...statistics,
      attempts,
      completedQuizAttempts: statistics.completedQuizAttempts + (attempt.type === "quiz" ? 1 : 0),
      completedMockAttempts: statistics.completedMockAttempts + (attempt.type === "mock" ? 1 : 0),
      totalCorrect: statistics.totalCorrect + correctCount,
      totalQuestions: statistics.totalQuestions + totalQuestions,
      bestScore: statistics.bestScore === null ? score : Math.max(statistics.bestScore, score),
      averageScore: Math.round(totalScore / attempts),
      studyTimeSeconds: statistics.studyTimeSeconds + studyTimeSeconds,
      lastAttemptAt: Date.now()
    };

    const newHistoryEntry = {
      id: `${Date.now()}-${attempt.type}`,
      type: attempt.type,
      score,
      totalQuestions,
      correctCount,
      timeUsedSeconds: studyTimeSeconds,
      completedAt: Date.now(),
      questions: attempt.questions || [],
      answers: attempt.answers || {}
    };

    attemptHistory.unshift(newHistoryEntry);

    saveStatistics(nextStatistics);
    saveAttemptHistory(attemptHistory);
  }

  function saveAnswers(sessionId, answers) {
    return set(`${KEYS.ANSWERS_PREFIX}${sessionId}`, answers || {});
  }

  function loadAnswers(sessionId) {
    return get(`${KEYS.ANSWERS_PREFIX}${sessionId}`, {});
  }

  function clearAnswers(sessionId) {
    return remove(`${KEYS.ANSWERS_PREFIX}${sessionId}`);
  }

  function saveReviewFlags(sessionId, reviewFlags) {
    return set(`${KEYS.REVIEW_PREFIX}${sessionId}`, reviewFlags || {});
  }

  function loadReviewFlags(sessionId) {
    return get(`${KEYS.REVIEW_PREFIX}${sessionId}`, {});
  }

  function clearReviewFlags(sessionId) {
    return remove(`${KEYS.REVIEW_PREFIX}${sessionId}`);
  }

  function saveTimer(timerId, timerState) {
    return set(`${KEYS.TIMER_PREFIX}${timerId}`, {
      ...(timerState || {}),
      updatedAt: timerState?.updatedAt || Date.now()
    });
  }

  function loadTimer(timerId) {
    return get(`${KEYS.TIMER_PREFIX}${timerId}`, null);
  }

  function clearTimer(timerId) {
    return remove(`${KEYS.TIMER_PREFIX}${timerId}`);
  }

  function saveExamSession(sessionId, sessionState) {
    return set(`${KEYS.SESSION_PREFIX}${sessionId}`, {
      ...(sessionState || {}),
      sessionId,
      updatedAt: Date.now()
    });
  }

  function loadExamSession(sessionId) {
    return get(`${KEYS.SESSION_PREFIX}${sessionId}`, null);
  }

  function clearExamSession(sessionId) {
    clearAnswers(sessionId);
    clearReviewFlags(sessionId);
    clearTimer(sessionId);
    return remove(`${KEYS.SESSION_PREFIX}${sessionId}`);
  }

  function saveAttemptHistory(history) {
    return set(KEYS.ATTEMPT_HISTORY, history || []);
  }

  function loadAttemptHistory() {
    return get(KEYS.ATTEMPT_HISTORY, []);
  }

  function loadDoneQuestions(setKey) {
    return get(`${KEYS.DONE_QUESTIONS_PREFIX}${setKey}`, []);
  }

  function saveDoneQuestions(setKey, questionIds) {
    return set(`${KEYS.DONE_QUESTIONS_PREFIX}${setKey}`, questionIds || []);
  }

  function listUnfinishedExams() {
    const sessions = [];

    try {
      for (let index = 0; index < window.localStorage.length; index += 1) {
        const key = window.localStorage.key(index);

        if (!key || !key.startsWith(getKey(KEYS.SESSION_PREFIX))) {
          continue;
        }

        const session = JSON.parse(window.localStorage.getItem(key));

        if (session && session.status !== "completed") {
          sessions.push(session);
        }
      }
    } catch (error) {
      return sessions;
    }

    return sessions.sort((first, second) => (second.updatedAt || 0) - (first.updatedAt || 0));
  }

  function getKey(key) {
    return key.startsWith(APP_PREFIX) ? key : `${APP_PREFIX}${key}`;
  }

  return {
    get,
    set,
    remove,
    saveSettings,
    loadSettings,
    saveStatistics,
    loadStatistics,
    recordAttempt,
    saveAttemptHistory,
    loadAttemptHistory,
    saveAnswers,
    loadAnswers,
    clearAnswers,
    saveReviewFlags,
    loadReviewFlags,
    clearReviewFlags,
    saveTimer,
    loadTimer,
    clearTimer,
    saveExamSession,
    loadExamSession,
    clearExamSession,
    loadDoneQuestions,
    saveDoneQuestions,
    listUnfinishedExams
  };
})();
