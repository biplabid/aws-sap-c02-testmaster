window.TestMaster = window.TestMaster || {};

window.TestMaster.random = (function createRandomModule(viewHelpers, questionEngine) {
  function initRandomShell(appState) {
    const elements = getElements();

    if (!elements.intro || !elements.panel || !elements.form) {
      return;
    }

    appState.random = {
      pool: [],
      currentIndex: 0,
      submitted: false
    };

    populateSetSelector(elements);

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
      nextTop: document.querySelector("#randomNextTop")
    };
  }

  function populateSetSelector(elements) {
    viewHelpers.populateSetSelector(elements.setSelector);
  }

  function resetToIntro(appState, elements) {
    elements.intro.classList.remove("hidden");
    elements.panel.classList.add("hidden");
    elements.feedback.classList.add("hidden");
    elements.feedback.innerHTML = "";
    populateSetSelector(elements);
  }

  async function startTest(appState, elements) {
    const setKey = elements.setSelector.value;

    if (!setKey) {
      alert("Please select a question set.");
      return;
    }

    const source = viewHelpers.resolveQuestionSetSource(setKey);
    await questionEngine.loadQuestions(source);
    const pool = questionEngine.shuffle(questionEngine.getQuestions());

    if (!pool.length) {
      alert("This question set is empty or could not be loaded.");
      return;
    }

    appState.random.pool = pool;
    appState.random.currentIndex = 0;

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

  return {
    initRandomShell
  };
})(window.TestMaster.viewHelpers, window.TestMaster.questionEngine);
