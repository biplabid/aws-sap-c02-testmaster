window.TestMaster = window.TestMaster || {};

window.TestMaster.mock = (function createMockModule(storage, timerFactory, viewHelpers, questionEngine) {
  const QUESTION_COUNT = 75;
  const DURATION_SECONDS = 3 * 60 * 60;
  const SESSION_ID = "mock-exam";

  function initMockShell(appState) {
    const elements = getMockElements();

    appState.mockExam = {
      sessionId: SESSION_ID,
      type: "mock",
      questionCount: QUESTION_COUNT,
      durationSeconds: DURATION_SECONDS,
      currentIndex: 0,
      questions: [],
      preparedQuestions: null,
      answers: {},
      marked: {},
      timer: null,
      started: false,
      completed: false,
      phase: "intro"
    };

    if (!elements.workspace || !elements.form) {
      return;
    }

    elements.start.addEventListener("click", () => {
      handleStartClick(appState, elements);
    });

    elements.form.addEventListener("change", () => {
      saveCurrentAnswer(appState, elements);
      renderPalette(appState, elements);
      updateStatus(appState, elements);
    });

    elements.previous.addEventListener("click", () => {
      goToQuestion(appState, elements, appState.mockExam.currentIndex - 1);
    });

    elements.next.addEventListener("click", () => {
      goToQuestion(appState, elements, appState.mockExam.currentIndex + 1);
    });

    elements.markReview.addEventListener("click", () => {
      toggleMarkForReview(appState, elements);
    });

    elements.reviewButton.addEventListener("click", () => {
      openReviewScreen(appState, elements);
    });

    elements.endTest.addEventListener("click", () => {
      openSubmitConfirmation(appState, elements);
    });

    elements.returnExam.addEventListener("click", () => {
      returnToExam(appState, elements);
    });

    elements.submitRequest.addEventListener("click", () => {
      openSubmitConfirmation(appState, elements);
    });

    elements.cancelSubmit.addEventListener("click", () => {
      closeSubmitConfirmation(elements);
    });

    elements.confirmSubmit.addEventListener("click", () => {
      finishMockExam(appState, elements);
    });

    elements.restart.addEventListener("click", () => {
      returnToIntroForNewAttempt(appState, elements);
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

    elements.timer.textContent = timerFactory.formatTime(DURATION_SECONDS, { showHours: true });

    if (storage.loadExamSession(SESSION_ID)) {
      elements.start.textContent = "Resume Mock Exam";
    }
  }

  function getMockElements() {
    return {
      intro: document.querySelector("#mockIntro"),
      prepareNote: document.querySelector("#mockPrepareNote"),
      prepareTrack: document.querySelector("#mockPrepareTrack"),
      prepareFill: document.querySelector("#mockPrepareFill"),
      prepareStatus: document.querySelector("#mockPrepareStatus"),
      start: document.querySelector("#mockStart"),
      workspace: document.querySelector("#mockWorkspace"),
      reviewScreen: document.querySelector("#mockReviewScreen"),
      result: document.querySelector("#mockResult"),
      timer: document.querySelector("#mockTimer"),
      progress: document.querySelector("#mockProgressText"),
      markedText: document.querySelector("#mockMarkedText"),
      reviewButton: document.querySelector("#mockReviewButton"),
      endTest: document.querySelector("#mockEndTest"),
      palette: document.querySelector("#mockPalette"),
      meta: document.querySelector("#mockQuestionMeta"),
      type: document.querySelector("#mockQuestionType"),
      prompt: document.querySelector("#mockQuestionPrompt"),
      form: document.querySelector("#mockAnswerForm"),
      previous: document.querySelector("#mockPrevious"),
      next: document.querySelector("#mockNext"),
      markReview: document.querySelector("#mockMarkReview"),
      reviewAnswered: document.querySelector("#mockReviewAnswered"),
      reviewUnanswered: document.querySelector("#mockReviewUnanswered"),
      reviewMarked: document.querySelector("#mockReviewMarked"),
      reviewTime: document.querySelector("#mockReviewTime"),
      reviewList: document.querySelector("#mockReviewList"),
      returnExam: document.querySelector("#mockReturnExam"),
      submitRequest: document.querySelector("#mockSubmitRequest"),
      confirmModal: document.querySelector("#mockConfirmModal"),
      confirmText: document.querySelector("#mockConfirmText"),
      cancelSubmit: document.querySelector("#mockCancelSubmit"),
      confirmSubmit: document.querySelector("#mockConfirmSubmit"),
      restart: document.querySelector("#mockRestart"),
      resultTitle: document.querySelector("#mockResultTitle"),
      resultText: document.querySelector("#mockResultText"),
      score: document.querySelector("#mockScore"),
      correctCount: document.querySelector("#mockCorrectCount"),
      answeredCount: document.querySelector("#mockAnsweredCount"),
      incorrectCount: document.querySelector("#mockIncorrectCount"),
      correctTile: document.querySelector("#mockCorrectTile"),
      incorrectTile: document.querySelector("#mockIncorrectTile"),
      resultList: document.querySelector("#mockResultList")
    };
  }

  async function handleStartClick(appState, elements) {
    const session = storage.loadExamSession(SESSION_ID);

    if (session) {
      startMockExam(appState, elements);
      return;
    }

    if (appState.mockExam.phase === "preparing") {
      return;
    }

    if (appState.mockExam.phase === "ready" && appState.mockExam.preparedQuestions) {
      startMockExam(appState, elements);
      return;
    }

    await prepareQuestionSet(appState, elements);
  }

  /**
   * Combines every bundled/uploaded question bank into one pool and draws a
   * fresh, randomized 75-question set from it, reporting progress as each
   * bank is fetched.
   */
  async function prepareQuestionSet(appState, elements) {
    appState.mockExam.phase = "preparing";
    appState.mockExam.preparedQuestions = null;

    elements.start.disabled = true;
    elements.start.textContent = "Preparing Question Paper...";
    if (elements.prepareNote) elements.prepareNote.classList.add("hidden");
    setPrepareProgress(elements, 0, "Discovering question banks...");

    const sets = await viewHelpers.getAvailableQuestionSets();
    const combined = [];

    for (let index = 0; index < sets.length; index += 1) {
      const set = sets[index];
      const source = viewHelpers.resolveQuestionSetSource(set.key);

      await questionEngine.loadQuestions(source);
      questionEngine.getQuestions().forEach((question) => {
        combined.push({ ...question, id: `${set.key}:${question.id}` });
      });

      const percent = Math.round(((index + 1) / sets.length) * 100);
      setPrepareProgress(elements, percent, `Combining ${set.name} (${index + 1} of ${sets.length})...`);
    }

    let pool = questionEngine.shuffle(combined);
    while (pool.length < QUESTION_COUNT && combined.length > 0) {
      pool = pool.concat(questionEngine.shuffle(combined));
    }

    appState.mockExam.preparedQuestions = pool.slice(0, QUESTION_COUNT).map((question, index) => ({
      ...question,
      examId: `${question.id}-mock-${index + 1}`,
      examNumber: index + 1
    }));

    appState.mockExam.phase = "ready";
    elements.prepareTrack.classList.add("hidden");
    elements.prepareStatus.textContent = `Ready! ${QUESTION_COUNT} questions randomly selected from ${combined.length} across ${sets.length} question bank${sets.length === 1 ? "" : "s"}. Click "Start Test" to begin.`;

    elements.start.disabled = false;
    elements.start.textContent = "Start Test";
  }

  function setPrepareProgress(elements, percent, statusText) {
    if (elements.prepareTrack) {
      elements.prepareTrack.classList.remove("hidden");
      elements.prepareTrack.setAttribute("aria-valuenow", String(percent));
    }
    if (elements.prepareFill) {
      elements.prepareFill.style.width = `${percent}%`;
    }
    if (elements.prepareStatus) {
      elements.prepareStatus.classList.remove("hidden");
      elements.prepareStatus.textContent = statusText;
    }
  }

  function returnToIntroForNewAttempt(appState, elements) {
    storage.clearExamSession(SESSION_ID);

    appState.mockExam.started = false;
    appState.mockExam.completed = false;
    appState.mockExam.phase = "intro";
    appState.mockExam.preparedQuestions = null;

    elements.result.classList.add("hidden");
    elements.workspace.classList.add("hidden");
    elements.reviewScreen.classList.add("hidden");
    elements.intro.classList.remove("hidden");

    if (elements.prepareNote) elements.prepareNote.classList.remove("hidden");
    if (elements.prepareTrack) elements.prepareTrack.classList.add("hidden");
    if (elements.prepareStatus) {
      elements.prepareStatus.classList.add("hidden");
      elements.prepareStatus.textContent = "";
    }

    elements.start.classList.remove("hidden");
    elements.start.disabled = false;
    elements.start.textContent = "Begin Mock Exam";
  }

  async function startMockExam(appState, elements) {
    const session = storage.loadExamSession(SESSION_ID);
    const shouldRestore = Boolean(session);

    if (appState.mockExam.started && !shouldRestore) {
      return;
    }

    if (appState.mockExam.timer) {
      appState.mockExam.timer.reset();
    }

    if (shouldRestore) {
      appState.mockExam.questions = session.questions;
      appState.mockExam.answers = storage.loadAnswers(SESSION_ID);
      appState.mockExam.marked = storage.loadReviewFlags(SESSION_ID);
      appState.mockExam.currentIndex = session.currentIndex;
    } else {
      appState.mockExam.questions = appState.mockExam.preparedQuestions;
      appState.mockExam.preparedQuestions = null;
      appState.mockExam.answers = {};
      appState.mockExam.marked = {};
      appState.mockExam.currentIndex = 0;
      storage.clearExamSession(SESSION_ID);
    }

    appState.mockExam.started = true;
    appState.mockExam.completed = false;
    appState.mockExam.phase = "exam";

    elements.intro.classList.add("hidden");
    elements.result.classList.add("hidden");
    elements.reviewScreen.classList.add("hidden");
    elements.confirmModal.classList.add("hidden");
    elements.workspace.classList.remove("hidden");

    renderQuestion(appState, elements);
    renderPalette(appState, elements);
    updateStatus(appState, elements);
    startTimer(appState, elements);
    elements.start.classList.add("hidden");
  }

  function startTimer(appState, elements) {
    const session = storage.loadExamSession(SESSION_ID);
    const shouldRestore = Boolean(session);

    appState.mockExam.timer = timerFactory.createTimer({
      id: SESSION_ID,
      durationSeconds: DURATION_SECONDS,
      onTick: (timerState) => {
        elements.timer.textContent = timerFactory.formatTime(timerState.remainingSeconds, { showHours: true });
        timerFactory.applyTimerClasses(elements.timer, timerState);
        if (appState.mockExam.phase === "review") {
          renderReviewStats(appState, elements);
        }
      },
      onComplete: () => finishMockExam(appState, elements)
    });
    appState.mockExam.timer.start({ restore: shouldRestore });
  }

  function renderQuestion(appState, elements) {
    const question = appState.mockExam.questions[appState.mockExam.currentIndex];

    if (!question) {
      renderUnavailable(elements);
      return;
    }

    viewHelpers.renderQuestion(question, elements, {
      inputName: "mock-answer",
      checked: getSavedAnswers(appState),
      metaPrefix: `Question ${question.examNumber} of ${QUESTION_COUNT}`
    });

    elements.previous.disabled = appState.mockExam.currentIndex === 0;
    elements.next.disabled = appState.mockExam.currentIndex === appState.mockExam.questions.length - 1;
    elements.markReview.classList.toggle("marked", isCurrentMarked(appState));
    elements.markReview.textContent = isCurrentMarked(appState) ? "Unmark Review" : "Mark for Review";
  }

  function renderPalette(appState, elements) {
    viewHelpers.clearElement(elements.palette);

    appState.mockExam.questions.forEach((question, index) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "palette-button";
      button.textContent = String(index + 1);

      if (index === appState.mockExam.currentIndex && appState.mockExam.phase === "exam") {
        button.classList.add("current");
      }

      if (hasSavedAnswer(appState, question.examId)) {
        button.classList.add("answered");
      }

      if (appState.mockExam.marked[question.examId]) {
        button.classList.add("marked");
      }

      button.addEventListener("click", () => {
        goToQuestion(appState, elements, index);
      });

      elements.palette.appendChild(button);
    });
  }

  function saveCurrentAnswer(appState, elements) {
    const question = appState.mockExam.questions[appState.mockExam.currentIndex];

    if (!question) {
      return;
    }

    const selectedAnswers = Array.from(elements.form.querySelectorAll("input:checked"))
      .map((input) => input.value);

    appState.mockExam.answers[question.examId] = selectedAnswers;
    storage.saveAnswers(SESSION_ID, appState.mockExam.answers);
    storage.saveExamSession(SESSION_ID, {
      type: "mock",
      status: "in-progress",
      currentIndex: appState.mockExam.currentIndex,
      questions: appState.mockExam.questions
    });
  }

  function getSavedAnswers(appState) {
    const question = appState.mockExam.questions[appState.mockExam.currentIndex];

    if (!question) {
      return [];
    }

    return appState.mockExam.answers[question.examId] || [];
  }

  function hasSavedAnswer(appState, examId) {
    return Array.isArray(appState.mockExam.answers[examId])
      && appState.mockExam.answers[examId].length > 0;
  }

  function isCurrentMarked(appState) {
    const question = appState.mockExam.questions[appState.mockExam.currentIndex];
    return Boolean(question && appState.mockExam.marked[question.examId]);
  }

  function toggleMarkForReview(appState, elements) {
    const question = appState.mockExam.questions[appState.mockExam.currentIndex];

    if (!question) {
      return;
    }

    appState.mockExam.marked[question.examId] = !appState.mockExam.marked[question.examId];

    if (!appState.mockExam.marked[question.examId]) {
      delete appState.mockExam.marked[question.examId];
    }

    elements.markReview.classList.toggle("marked", isCurrentMarked(appState));
    elements.markReview.textContent = isCurrentMarked(appState) ? "Unmark Review" : "Mark for Review";
    renderPalette(appState, elements);
    updateStatus(appState, elements);
    storage.saveReviewFlags(SESSION_ID, appState.mockExam.marked);
  }

  function goToQuestion(appState, elements, index) {
    if (index < 0 || index >= appState.mockExam.questions.length || appState.mockExam.completed) {
      return;
    }

    saveCurrentAnswer(appState, elements);
    appState.mockExam.currentIndex = index;
    appState.mockExam.phase = "exam";

    elements.reviewScreen.classList.add("hidden");
    elements.result.classList.add("hidden");
    elements.workspace.classList.remove("hidden");

    renderQuestion(appState, elements);
    renderPalette(appState, elements);
  }

  function updateStatus(appState, elements) {
    const stats = getExamStats(appState);
    elements.progress.textContent = `${stats.answered} / ${QUESTION_COUNT} answered`;
    elements.markedText.textContent = `${stats.marked} marked for review`;
  }

  function openReviewScreen(appState, elements) {
    saveCurrentAnswer(appState, elements);
    appState.mockExam.phase = "review";

    elements.workspace.classList.add("hidden");
    elements.reviewScreen.classList.remove("hidden");
    elements.result.classList.add("hidden");

    renderReviewScreen(appState, elements);
  }

  function returnToExam(appState, elements) {
    appState.mockExam.phase = "exam";
    elements.reviewScreen.classList.add("hidden");
    elements.workspace.classList.remove("hidden");
    renderQuestion(appState, elements);
  }

  function renderReviewScreen(appState, elements) {
    renderReviewStats(appState, elements);
    viewHelpers.clearElement(elements.reviewList);

    appState.mockExam.questions.forEach((question, index) => {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "review-row";

      const label = document.createElement("strong");
      label.textContent = `Question ${index + 1}`;

      const prompt = document.createElement("span");
      prompt.textContent = question.prompt;

      const statuses = document.createElement("span");
      statuses.className = "review-statuses";

      statuses.appendChild(createStatusPill(
        hasSavedAnswer(appState, question.examId) ? "Answered" : "Unanswered",
        hasSavedAnswer(appState, question.examId) ? "answered" : "unanswered"
      ));

      if (appState.mockExam.marked[question.examId]) {
        statuses.appendChild(createStatusPill("Marked", "marked"));
      }

      row.appendChild(label);
      row.appendChild(prompt);
      row.appendChild(statuses);
      row.addEventListener("click", () => {
        goToQuestion(appState, elements, index);
      });

      elements.reviewList.appendChild(row);
    });
  }

  function renderReviewStats(appState, elements) {
    const stats = getExamStats(appState);
    elements.reviewAnswered.textContent = `${stats.answered}`;
    elements.reviewUnanswered.textContent = `${stats.unanswered}`;
    elements.reviewMarked.textContent = `${stats.marked}`;
    const remaining = appState.mockExam.timer?.getState().remainingSeconds || 0;
    elements.reviewTime.textContent = timerFactory.formatTime(remaining, { showHours: true });
  }

  function createStatusPill(text, type) {
    const pill = document.createElement("span");
    pill.className = `status-pill ${type}`;
    pill.textContent = text;
    return pill;
  }

  function openSubmitConfirmation(appState, elements) {
    const stats = getExamStats(appState);
    elements.confirmText.textContent = `You have ${stats.unanswered} unanswered question(s) and ${stats.marked} question(s) marked for review. Submitting will end the exam and lock all answers.`;
    elements.confirmModal.classList.remove("hidden");
  }

  function closeSubmitConfirmation(elements) {
    elements.confirmModal.classList.add("hidden");
  }

  function finishMockExam(appState, elements) {
    if (appState.mockExam.completed) {
      return;
    }

    if (appState.mockExam.phase === "exam") {
      saveCurrentAnswer(appState, elements);
    }

    const timerState = appState.mockExam.timer.complete({ clearStorage: false });

    appState.mockExam.started = false;
    appState.mockExam.completed = true;
    appState.mockExam.phase = "result";

    const result = calculateResult(appState);

    storage.recordAttempt({
      type: "mock",
      score: result.score,
      totalQuestions: QUESTION_COUNT,
      correctCount: result.correctCount,
      timeUsedSeconds: timerState.durationSeconds - timerState.remainingSeconds
    });

    storage.clearExamSession(SESSION_ID);
    renderResult(appState, elements, result);

    elements.workspace.classList.add("hidden");
    elements.reviewScreen.classList.add("hidden");
    elements.intro.classList.add("hidden");
    elements.confirmModal.classList.add("hidden");
    elements.result.classList.remove("hidden");
  }

  function calculateResult(appState) {
    const questions = appState.mockExam.questions;
    let correctCount = 0;
    let answeredCount = 0;

    const rows = questions.map((question, index) => {
      const selectedAnswers = appState.mockExam.answers[question.examId] || [];
      const answered = selectedAnswers.length > 0;
      const marked = Boolean(appState.mockExam.marked[question.examId]);
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
        marked,
        correct
      };
    });

    return {
      correctCount,
      incorrectCount: questions.length - correctCount,
      answeredCount,
      markedCount: Object.keys(appState.mockExam.marked).length,
      score: Math.round((correctCount / questions.length) * 100),
      timeUsedSeconds: DURATION_SECONDS - Math.max(0, appState.mockExam.timer.getState().remainingSeconds),
      rows
    };
  }

  function renderResult(appState, elements, result) {
    appState.mockExam.result = result;
    appState.mockExam.resultFilter = "all";

    elements.resultTitle.textContent = `Score: ${result.score}%`;
    elements.resultText.textContent = `You answered ${result.answeredCount} of ${QUESTION_COUNT} questions, marked ${result.markedCount} for review, and got ${result.correctCount} correct.`;
    elements.score.textContent = `${result.score}%`;
    elements.correctCount.textContent = `${result.correctCount} / ${QUESTION_COUNT}`;
    elements.answeredCount.textContent = `${result.answeredCount} / ${QUESTION_COUNT}`;
    elements.incorrectCount.textContent = `${result.incorrectCount} / ${QUESTION_COUNT}`;

    renderResultList(elements, result, "all", appState);
  }

  function toggleResultFilter(appState, elements, filter) {
    if (!appState.mockExam.result) {
      return;
    }

    const nextFilter = appState.mockExam.resultFilter === filter ? "all" : filter;
    appState.mockExam.resultFilter = nextFilter;
    renderResultList(elements, appState.mockExam.result, nextFilter, appState);
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
          appState.mockExam.resultFilter = "all";
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

  function buildAiCoachButton(row) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ai-coach-button";
    button.title = "Ask the AWS SAP-C02 Coach about this question";

    const icon = document.createElement("span");
    icon.className = "ai-coach-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "AI";

    button.appendChild(icon);
    button.append(" Ask AI Coach");

    button.addEventListener("click", () => {
      window.TestMaster.aiCoach.askAboutQuestion({ prompt: row.prompt, options: row.options });
    });

    return button;
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
      badge.textContent = row.marked ? "Marked" : "Unanswered";
    } else if (row.correct) {
      badge.classList.add("correct");
      badge.textContent = row.marked ? "Correct + Marked" : "Correct";
    } else {
      badge.classList.add("wrong");
      badge.textContent = row.marked ? "Wrong + Marked" : "Wrong";
    }

    item.appendChild(index);
    item.appendChild(prompt);
    item.appendChild(badge);
    item.appendChild(viewHelpers.buildAnswerBreakdown(row));
    return item;
  }

  function buildDetailedRow(row) {
    const item = document.createElement("div");
    item.className = "result-row result-row-detail";

    const header = document.createElement("div");
    header.className = "result-row-header";

    const headerLeft = document.createElement("span");
    headerLeft.className = "result-row-header-left";

    const index = document.createElement("span");
    index.className = "result-index";
    index.textContent = `Q${row.index}`;

    const badge = document.createElement("span");
    badge.className = `result-badge ${row.correct ? "correct" : "wrong"}`;
    badge.textContent = row.correct ? "Correct" : "Incorrect";

    headerLeft.appendChild(index);
    headerLeft.appendChild(badge);
    header.appendChild(headerLeft);
    header.appendChild(buildAiCoachButton(row));

    const prompt = document.createElement("p");
    prompt.className = "result-row-prompt";
    prompt.textContent = row.prompt;

    item.appendChild(header);
    item.appendChild(prompt);
    item.appendChild(viewHelpers.buildAnswerBreakdown(row));

    if (!row.correct && row.explanation) {
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "secondary-action explanation-toggle";
      toggle.textContent = "Explanation";

      const explanationBox = document.createElement("div");
      explanationBox.className = "result-explanation hidden";

      const explanationText = document.createElement("p");
      explanationText.textContent = row.explanation;
      explanationBox.appendChild(explanationText);

      toggle.addEventListener("click", () => {
        const isHidden = explanationBox.classList.toggle("hidden");
        toggle.textContent = isHidden ? "Explanation" : "Hide Explanation";
      });

      item.appendChild(toggle);
      item.appendChild(explanationBox);
    }

    return item;
  }

  function getExamStats(appState) {
    const answered = appState.mockExam.questions
      .filter((question) => hasSavedAnswer(appState, question.examId))
      .length;
    const marked = Object.keys(appState.mockExam.marked).length;

    return {
      answered,
      marked,
      unanswered: QUESTION_COUNT - answered
    };
  }

  function renderUnavailable(elements) {
    elements.prompt.textContent = "No mock exam questions are available.";
    elements.type.textContent = "Exam unavailable";
    elements.previous.disabled = true;
    elements.next.disabled = true;
    elements.markReview.disabled = true;
    elements.reviewButton.disabled = true;
  }

  return {
    initMockShell
  };
})(window.TestMaster.storage, window.TestMaster.timer, window.TestMaster.viewHelpers, window.TestMaster.questionEngine);
