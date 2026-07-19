window.TestMaster = window.TestMaster || {};

window.TestMaster.quiz = (function createQuizModule(storage, timerFactory, viewHelpers, questionEngine) {
  const QUESTION_COUNT = 20;
  const DURATION_SECONDS = 40 * 60;
  const SESSION_ID = "timed-quiz";

  function initQuizShell(appState) {
    const elements = getQuizElements();

    appState.quiz = {
      sessionId: SESSION_ID,
      type: "quiz",
      questionCount: QUESTION_COUNT,
      durationSeconds: DURATION_SECONDS,
      currentIndex: 0,
      questions: [],
      answers: {},
      timer: null,
      started: false,
      completed: false
    };

    if (!elements.workspace || !elements.form) {
      return;
    }

    viewHelpers.populateSetSelector(elements.setSelector);

    if (storage.loadExamSession(SESSION_ID)) {
      elements.start.textContent = "Resume Quiz";
    }

    elements.start.addEventListener("click", () => {
      startQuiz(appState, elements, false);
    });

    elements.form.addEventListener("change", () => {
      saveCurrentAnswer(appState, elements);
      renderPalette(appState, elements);
      updateProgress(appState, elements);
    });

    elements.previous.addEventListener("click", () => {
      goToQuestion(appState, elements, appState.quiz.currentIndex - 1);
    });

    elements.next.addEventListener("click", () => {
      goToQuestion(appState, elements, appState.quiz.currentIndex + 1);
    });

    elements.finish.addEventListener("click", () => {
      finishQuiz(appState, elements);
    });

    elements.restart.addEventListener("click", () => {
      startQuiz(appState, elements, true);
    });

    window.addEventListener("testmaster:view-change", (event) => {
      if (event.detail.view === "timed" && !appState.quiz.started && !appState.quiz.completed) {
        if (storage.loadExamSession(SESSION_ID)) {
          startQuiz(appState, elements, false);
        } else {
          viewHelpers.populateSetSelector(elements.setSelector);
        }
      }
    });

    if (window.location.hash === "#timed" && storage.loadExamSession(SESSION_ID)) {
      startQuiz(appState, elements, false);
    }
  }

  function getQuizElements() {
    return {
      intro: document.querySelector("#timedIntro"),
      setSelector: document.querySelector("#timedSetSelector"),
      start: document.querySelector("#timedStart"),
      workspace: document.querySelector("#quizWorkspace"),
      result: document.querySelector("#quizResult"),
      timer: document.querySelector("#quizTimer"),
      progress: document.querySelector("#quizProgressText"),
      palette: document.querySelector("#quizPalette"),
      meta: document.querySelector("#quizQuestionMeta"),
      type: document.querySelector("#quizQuestionType"),
      prompt: document.querySelector("#quizQuestionPrompt"),
      form: document.querySelector("#quizAnswerForm"),
      previous: document.querySelector("#quizPrevious"),
      next: document.querySelector("#quizNext"),
      finish: document.querySelector("#quizFinish"),
      restart: document.querySelector("#quizRestart"),
      resultTitle: document.querySelector("#quizResultTitle"),
      resultText: document.querySelector("#quizResultText"),
      score: document.querySelector("#quizScore"),
      correctCount: document.querySelector("#quizCorrectCount"),
      answeredCount: document.querySelector("#quizAnsweredCount"),
      timeUsed: document.querySelector("#quizTimeUsed"),
      resultList: document.querySelector("#quizResultList")
    };
  }

  async function startQuiz(appState, elements, forceNew) {
    const session = storage.loadExamSession(SESSION_ID);
    const shouldRestore = session && !forceNew;

    if (appState.quiz.started && !shouldRestore && !forceNew) {
      return;
    }

    if (appState.quiz.timer) {
      appState.quiz.timer.reset();
    }

    if (shouldRestore) {
      appState.quiz.questions = session.questions;
      appState.quiz.answers = storage.loadAnswers(SESSION_ID);
      appState.quiz.currentIndex = session.currentIndex;
    } else {
      const setKey = elements.setSelector ? elements.setSelector.value : "set1";
      const source = viewHelpers.resolveQuestionSetSource(setKey);
      appState.quiz.questions = await buildQuestionSet(appState, QUESTION_COUNT, source);
      appState.quiz.answers = {};
      appState.quiz.currentIndex = 0;
      storage.clearExamSession(SESSION_ID);
    }

    appState.quiz.started = true;
    appState.quiz.completed = false;

    elements.intro.classList.add("hidden");

    appState.quiz.timer = timerFactory.createTimer({
      id: SESSION_ID,
      durationSeconds: DURATION_SECONDS,
      onTick: (timerState) => {
        elements.timer.textContent = timerFactory.formatTime(timerState.remainingSeconds);
        timerFactory.applyTimerClasses(elements.timer, timerState);
      },
      onComplete: () => finishQuiz(appState, elements)
    });

    appState.quiz.timer.start({ restore: shouldRestore });

    elements.workspace.classList.remove("hidden");
    elements.result.classList.add("hidden");

    renderQuestion(appState, elements);
    renderPalette(appState, elements);
    updateProgress(appState, elements);
  }

  async function buildQuestionSet(appState, count, source = "data/set1.json") {
    const engine = appState.questionEngine;
    await questionEngine.loadQuestions(source);

    const availableQuestions = engine.getQuestions();
    const selectedQuestions = engine.randomSelection(count);

    while (selectedQuestions.length < count && availableQuestions.length > 0) {
      const nextBatch = engine.shuffle(availableQuestions);
      nextBatch.forEach((question) => {
        if (selectedQuestions.length < count) {
          selectedQuestions.push(question);
        }
      });
    }

    return selectedQuestions.slice(0, count).map((question, index) => ({
      ...question,
      quizId: `${question.id}-quiz-${index + 1}`,
      quizNumber: index + 1
    }));
  }

  function renderQuestion(appState, elements) {
    const question = appState.quiz.questions[appState.quiz.currentIndex];

    if (!question) {
      renderUnavailable(elements);
      return;
    }

    viewHelpers.renderQuestion(question, elements, {
      inputName: "quiz-answer",
      checked: getSavedAnswers(appState),
      metaPrefix: `Question ${question.quizNumber} of ${QUESTION_COUNT}`
    });

    elements.previous.disabled = appState.quiz.currentIndex === 0;
    elements.next.disabled = appState.quiz.currentIndex === appState.quiz.questions.length - 1;

  }

  function renderPalette(appState, elements) {
    viewHelpers.clearElement(elements.palette);

    appState.quiz.questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-button";
      button.textContent = String(index + 1);

      if (index === appState.quiz.currentIndex) {
        button.classList.add("current");
      }

      if (hasSavedAnswer(appState, question.quizId)) {
        button.classList.add("answered");
      }

      button.addEventListener("click", () => {
        goToQuestion(appState, elements, index);
      });

      elements.palette.appendChild(button);
    });
  }

  function saveCurrentAnswer(appState, elements) {
    const question = appState.quiz.questions[appState.quiz.currentIndex];

    if (!question) {
      return;
    }

    const selectedAnswers = Array.from(elements.form.querySelectorAll("input:checked"))
      .map((input) => input.value);

    appState.quiz.answers[question.quizId] = selectedAnswers;
    storage.saveAnswers(SESSION_ID, appState.quiz.answers);
    storage.saveExamSession(SESSION_ID, {
      type: "quiz",
      status: "in-progress",
      currentIndex: appState.quiz.currentIndex,
      questions: appState.quiz.questions
    });
  }

  function getSavedAnswers(appState) {
    const question = appState.quiz.questions[appState.quiz.currentIndex];

    if (!question) {
      return [];
    }

    return appState.quiz.answers[question.quizId] || [];
  }

  function hasSavedAnswer(appState, quizId) {
    return Array.isArray(appState.quiz.answers[quizId])
      && appState.quiz.answers[quizId].length > 0;
  }

  function goToQuestion(appState, elements, index) {
    if (index < 0 || index >= appState.quiz.questions.length || appState.quiz.completed) {
      return;
    }

    saveCurrentAnswer(appState, elements);
    appState.quiz.currentIndex = index;
    renderQuestion(appState, elements);
  }

  function updateProgress(appState, elements) {
    const answeredCount = appState.quiz.questions
      .filter((question) => hasSavedAnswer(appState, question.quizId))
      .length;

    elements.progress.textContent = `${answeredCount} / ${QUESTION_COUNT} answered`;
  }

  function finishQuiz(appState, elements) {
    if (appState.quiz.completed) {
      return;
    }

    saveCurrentAnswer(appState, elements);
    const timerState = appState.quiz.timer.complete({ clearStorage: false });

    appState.quiz.started = false;
    appState.quiz.completed = true;

    const result = calculateResult(appState);

    storage.recordAttempt({
      type: "quiz",
      score: result.score,
      totalQuestions: QUESTION_COUNT,
      correctCount: result.correctCount,
      timeUsedSeconds: timerState.durationSeconds - timerState.remainingSeconds,
      questions: appState.quiz.questions,
      answers: appState.quiz.answers
    });

    storage.clearExamSession(SESSION_ID);

    renderResult(appState, elements, result);

    elements.workspace.classList.add("hidden");
    elements.result.classList.remove("hidden");
  }

  function calculateResult(appState) {
    const questions = appState.quiz.questions;
    let correctCount = 0;
    let answeredCount = 0;

    const rows = questions.map((question, index) => {
      const selectedAnswers = appState.quiz.answers[question.quizId] || [];
      const answered = selectedAnswers.length > 0;
      const correct = answered && viewHelpers.isAnswerCorrect(question.correctAnswers, selectedAnswers);

      if (answered) {
        answeredCount += 1;
      }

      if (correct) {
        correctCount += 1;
      }

      return {
        index: index + 1,
        prompt: question.prompt,
        answered,
        correct
      };
    });

    return {
      correctCount,
      answeredCount,
      score: Math.round((correctCount / questions.length) * 100),
      timeUsedSeconds: DURATION_SECONDS - Math.max(0, appState.quiz.timer.getState().remainingSeconds),
      rows
    };
  }

  function renderResult(appState, elements, result) {
    viewHelpers.clearElement(elements.resultList);

    elements.resultTitle.textContent = `Score: ${result.score}%`;
    elements.resultText.textContent = `You answered ${result.answeredCount} of ${QUESTION_COUNT} questions and got ${result.correctCount} correct.`;
    elements.score.textContent = `${result.score}%`;
    elements.correctCount.textContent = `${result.correctCount} / ${QUESTION_COUNT}`;
    elements.answeredCount.textContent = `${result.answeredCount} / ${QUESTION_COUNT}`;
    elements.timeUsed.textContent = timerFactory.formatTime(result.timeUsedSeconds);

    result.rows.forEach((row) => {
      const item = document.createElement("div");
      item.className = "result-row";

      const index = document.createElement("span");
      index.className = "result-index";
      index.textContent = `Q${row.index}`;

      const prompt = document.createElement("p");
      prompt.textContent = row.prompt;

      const badge = document.createElement("span");
      badge.className = "result-badge";

      if (!row.answered) {
        badge.classList.add("unanswered");
        badge.textContent = "Unanswered";
      } else if (row.correct) {
        badge.classList.add("correct");
        badge.textContent = "Correct";
      } else {
        badge.classList.add("wrong");
        badge.textContent = "Wrong";
      }

      item.appendChild(index);
      item.appendChild(prompt);
      item.appendChild(badge);
      elements.resultList.appendChild(item);
    });
  }

  function renderUnavailable(elements) {
    elements.prompt.textContent = "No quiz questions are available.";
    elements.type.textContent = "Quiz unavailable";
    elements.previous.disabled = true;
    elements.next.disabled = true;
    elements.finish.disabled = true;
  }

  return {
    initQuizShell
  };
})(window.TestMaster.storage, window.TestMaster.timer, window.TestMaster.viewHelpers, window.TestMaster.questionEngine);
