window.TestMaster = window.TestMaster || {};

window.TestMaster.random = (function createRandomModule(viewHelpers, questionEngine, storage) {
  function initRandomShell(appState) {
    const elements = getElements();

    if (!elements.intro || !elements.panel || !elements.form) {
      return;
    }

    appState.random = {
      pool: [],
      currentIndex: 0,
      submitted: false,
      setKey: null,
      doneIds: new Set()
    };

    populateSetSelector(elements);
    updateDoneStatus(elements);

    elements.start.addEventListener("click", () => {
      startTest(appState, elements);
    });

    elements.submit.addEventListener("click", () => {
      submitAnswer(appState, elements);
    });

    elements.next.addEventListener("click", () => {
      nextQuestion(appState, elements);
    });

    elements.nextTop.addEventListener("click", () => {
      nextQuestion(appState, elements);
    });

    if (elements.markDone) {
      elements.markDone.addEventListener("click", () => {
        markCurrentAsDone(appState, elements);
      });
    }

    if (elements.setSelector) {
      elements.setSelector.addEventListener("change", () => {
        updateDoneStatus(elements);
      });
    }

    if (elements.resetDone) {
      elements.resetDone.addEventListener("click", () => {
        resetDoneQuestions(elements);
      });
    }

    window.addEventListener("testmaster:view-change", (event) => {
      if (event.detail.view === "random") {
        resetToIntro(appState, elements);
      }
    });
  }

  function getElements() {
    return {
      intro: document.querySelector("#randomIntro"),
      panel: document.querySelector(".random-test-panel"),
      setSelector: document.querySelector("#randomSetSelector"),
      start: document.querySelector("#randomStart"),
      meta: document.querySelector("#randomQuestionMeta"),
      type: document.querySelector("#randomQuestionType"),
      prompt: document.querySelector("#randomQuestionPrompt"),
      form: document.querySelector("#randomAnswerForm"),
      feedback: document.querySelector("#randomFeedback"),
      submit: document.querySelector("#randomSubmit"),
      next: document.querySelector("#randomNext"),
      nextTop: document.querySelector("#randomNextTop"),
      markDone: document.querySelector("#randomMarkDone"),
      resetDone: document.querySelector("#randomResetDone"),
      doneStatus: document.querySelector("#randomDoneStatusText")
    };
  }

  function populateSetSelector(elements) {
    viewHelpers.populateSetSelector(elements.setSelector);
  }

  function updateDoneStatus(elements) {
    if (!elements.doneStatus || !elements.setSelector || !elements.setSelector.value) {
      return;
    }

    const setKey = elements.setSelector.value;
    const doneCount = storage.loadDoneQuestions(setKey).length;
    elements.doneStatus.textContent = doneCount > 0
      ? `${doneCount} question${doneCount === 1 ? "" : "s"} marked done in this set.`
      : "No questions marked done in this set yet.";
  }

  function resetDoneQuestions(elements) {
    const setKey = elements.setSelector.value;

    if (!setKey) {
      return;
    }

    storage.saveDoneQuestions(setKey, []);
    updateDoneStatus(elements);

    if (window.TestMaster.ui) {
      window.TestMaster.ui.showToast("Done questions have been reset for this set.");
    }
  }

  function resetToIntro(appState, elements) {
    elements.intro.classList.remove("hidden");
    elements.panel.classList.add("hidden");
    elements.feedback.classList.add("hidden");
    elements.feedback.innerHTML = "";
    populateSetSelector(elements);
    updateDoneStatus(elements);
  }

  async function startTest(appState, elements) {
    const setKey = elements.setSelector.value;

    if (!setKey) {
      alert("Please select a question set.");
      return;
    }

    const source = viewHelpers.resolveQuestionSetSource(setKey);
    await questionEngine.loadQuestions(source);

    const doneIds = new Set(storage.loadDoneQuestions(setKey));
    const remaining = questionEngine.getQuestions().filter((question) => !doneIds.has(question.id));

    if (!questionEngine.getQuestions().length) {
      alert("This question set is empty or could not be loaded.");
      return;
    }

    if (!remaining.length) {
      alert("All questions in this set are marked as Done. Reset done questions to practice this set again.");
      return;
    }

    const pool = questionEngine.shuffle(remaining);

    appState.random.pool = pool;
    appState.random.currentIndex = 0;
    appState.random.setKey = setKey;
    appState.random.doneIds = doneIds;

    elements.intro.classList.add("hidden");
    elements.panel.classList.remove("hidden");

    renderCurrentQuestion(appState, elements);
  }

  function renderCurrentQuestion(appState, elements) {
    const question = appState.random.pool[appState.random.currentIndex];
    appState.random.submitted = false;

    viewHelpers.renderQuestion(question, elements, {
      inputName: "random-answer",
      metaPrefix: `Question ${appState.random.currentIndex + 1} of ${appState.random.pool.length}`
    });

    elements.feedback.classList.add("hidden");
    elements.feedback.innerHTML = "";
    elements.submit.disabled = false;

    if (elements.markDone) {
      elements.markDone.disabled = false;
      elements.markDone.textContent = "Mark as Done";
    }

    const isLast = appState.random.currentIndex === appState.random.pool.length - 1;
    elements.next.textContent = isLast ? "Finish" : "Next Question";
  }

  function getSelectedAnswers(elements) {
    return Array.from(elements.form.querySelectorAll("input:checked")).map((input) => input.value);
  }

  function submitAnswer(appState, elements) {
    if (appState.random.submitted) {
      return;
    }

    const question = appState.random.pool[appState.random.currentIndex];
    const selected = getSelectedAnswers(elements);

    if (selected.length === 0) {
      alert("Please select an answer.");
      return;
    }

    appState.random.submitted = true;

    const correct = viewHelpers.isAnswerCorrect(question.correctAnswers, selected);
    viewHelpers.applyAnswerHighlights(question, selected, elements.form);

    elements.feedback.classList.remove("hidden");
    elements.feedback.innerHTML = "";

    const resultLine = document.createElement("strong");
    resultLine.textContent = correct
      ? "Correct!"
      : `Incorrect. Correct answer: ${question.correctAnswers.join(", ")}`;
    elements.feedback.appendChild(resultLine);

    if (question.explanation) {
      const explanation = document.createElement("p");
      explanation.textContent = question.explanation;
      elements.feedback.appendChild(explanation);
    }

    elements.submit.disabled = true;
  }

  function nextQuestion(appState, elements) {
    if (appState.random.pool.length === 0) {
      return;
    }

    if (appState.random.currentIndex >= appState.random.pool.length - 1) {
      resetToIntro(appState, elements);
      return;
    }

    appState.random.currentIndex += 1;
    renderCurrentQuestion(appState, elements);
  }

  function markCurrentAsDone(appState, elements) {
    if (!appState.random.pool.length) {
      return;
    }

    const question = appState.random.pool[appState.random.currentIndex];
    appState.random.doneIds.add(question.id);
    storage.saveDoneQuestions(appState.random.setKey, Array.from(appState.random.doneIds));

    if (elements.markDone) {
      elements.markDone.disabled = true;
      elements.markDone.textContent = "Marked as Done";
    }

    if (window.TestMaster.ui) {
      window.TestMaster.ui.showToast("Question marked as done. It won't appear in future sessions.");
    }
  }

  return {
    initRandomShell
  };
})(window.TestMaster.viewHelpers, window.TestMaster.questionEngine, window.TestMaster.storage);
