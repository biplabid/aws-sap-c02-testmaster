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

    if (elements.correctTile) {
      elements.correctTile.addEventListener("click", () => {
        toggleResultFilter(appState, elements, "correct");
      });
      elements.correctTile.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleResultFilter(appState, elements, "correct");
        }
      });
    }

    if (elements.incorrectTile) {
      elements.incorrectTile.addEventListener("click", () => {
        toggleResultFilter(appState, elements, "incorrect");
      });
      elements.incorrectTile.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          toggleResultFilter(appState, elements, "incorrect");
        }
      });
    }

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
      incorrectCount: document.querySelector("#quizIncorrectCount"),
      correctTile: document.querySelector("#quizCorrectTile"),
      incorrectTile: document.querySelector("#quizIncorrectTile"),
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
        options: question.options,
        selectedAnswers,
        correctAnswers: question.correctAnswers,
        explanation: question.explanation,
        answered,
        correct
      };
    });

    return {
      correctCount,
      incorrectCount: questions.length - correctCount,
      answeredCount,
      score: Math.round((correctCount / questions.length) * 100),
      timeUsedSeconds: DURATION_SECONDS - Math.max(0, appState.quiz.timer.getState().remainingSeconds),
      rows
    };
  }

  function renderResult(appState, elements, result) {
    appState.quiz.result = result;
    appState.quiz.resultFilter = "all";

    elements.resultTitle.textContent = `Score: ${result.score}%`;
    elements.resultText.textContent = `You answered ${result.answeredCount} of ${QUESTION_COUNT} questions and got ${result.correctCount} correct.`;
    elements.score.textContent = `${result.score}%`;
    elements.correctCount.textContent = `${result.correctCount} / ${QUESTION_COUNT}`;
    elements.incorrectCount.textContent = `${result.incorrectCount} / ${QUESTION_COUNT}`;
    elements.answeredCount.textContent = `${result.answeredCount} / ${QUESTION_COUNT}`;
    elements.timeUsed.textContent = timerFactory.formatTime(result.timeUsedSeconds);

    renderResultList(elements, result, "all", appState);
  }

  function toggleResultFilter(appState, elements, filter) {
    if (!appState.quiz.result) {
      return;
    }

    const nextFilter = appState.quiz.resultFilter === filter ? "all" : filter;
    appState.quiz.resultFilter = nextFilter;
    renderResultList(elements, appState.quiz.result, nextFilter, appState);
  }

  function renderResultList(elements, result, filter, appState) {
    viewHelpers.clearElement(elements.resultList);

    if (elements.correctTile) {
      elements.correctTile.classList.toggle("active", filter === "correct");
      elements.correctTile.setAttribute("aria-pressed", String(filter === "correct"));
    }

    if (elements.incorrectTile) {
      elements.incorrectTile.classList.toggle("active", filter === "incorrect");
      elements.incorrectTile.setAttribute("aria-pressed", String(filter === "incorrect"));
    }

    if (filter !== "all") {
      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "secondary-action result-list-clear";
      clearButton.textContent = "Show all questions";
      clearButton.addEventListener("click", () => {
        if (appState) {
          appState.quiz.resultFilter = "all";
        }
        renderResultList(elements, result, "all", appState);
      });
      elements.resultList.appendChild(clearButton);
    }

    const rows = result.rows.filter((row) => {
      if (filter === "correct") return row.correct;
      if (filter === "incorrect") return !row.correct;
      return true;
    });

    rows.forEach((row) => {
      elements.resultList.appendChild(filter === "all" ? buildSimpleRow(row) : buildDetailedRow(row));
    });
  }

  function buildSimpleRow(row) {
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
    return item;
  }

  function buildDetailedRow(row) {
    const item = document.createElement("div");
    item.className = "result-row result-row-detail";

    const header = document.createElement("div");
    header.className = "result-row-header";

    const index = document.createElement("span");
    index.className = "result-index";
    index.textContent = `Q${row.index}`;

    const badge = document.createElement("span");
    badge.className = `result-badge ${row.correct ? "correct" : "wrong"}`;
    badge.textContent = row.correct ? "Correct" : "Incorrect";

    header.appendChild(index);
    header.appendChild(badge);

    const prompt = document.createElement("p");
    prompt.className = "result-row-prompt";
    prompt.textContent = row.prompt;

    const yourAnswer = document.createElement("p");
    yourAnswer.className = "result-row-answer";
    const answerLabel = document.createElement("strong");
    answerLabel.textContent = "Your answer: ";
    yourAnswer.appendChild(answerLabel);
    yourAnswer.append(formatAnswerText(row.selectedAnswers, row.options) || "Not answered");

    item.appendChild(header);
    item.appendChild(prompt);
    item.appendChild(yourAnswer);

    if (!row.correct) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "secondary-action explanation-toggle";
      toggle.textContent = "Show correct answer & explanation";

      const explanationBox = document.createElement("div");
      explanationBox.className = "result-explanation hidden";

      const correctAnswerLine = document.createElement("p");
      const correctLabel = document.createElement("strong");
      correctLabel.textContent = "Correct answer: ";
      correctAnswerLine.appendChild(correctLabel);
      correctAnswerLine.append(formatAnswerText(row.correctAnswers, row.options));
      explanationBox.appendChild(correctAnswerLine);

      if (row.explanation) {
        const explanationText = document.createElement("p");
        explanationText.textContent = row.explanation;
        explanationBox.appendChild(explanationText);
      }

      toggle.addEventListener("click", () => {
        const isHidden = explanationBox.classList.toggle("hidden");
        toggle.textContent = isHidden ? "Show correct answer & explanation" : "Hide correct answer & explanation";
      });

      item.appendChild(toggle);
      item.appendChild(explanationBox);
    }

    return item;
  }

  function formatAnswerText(answerIds, options) {
    if (!Array.isArray(answerIds) || answerIds.length === 0) {
      return "";
    }

    return answerIds
      .map((id) => {
        const option = Array.isArray(options) ? options.find((opt) => opt.id === id) : null;
        return option ? `${id}) ${option.text}` : id;
      })
      .join("; ");
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
