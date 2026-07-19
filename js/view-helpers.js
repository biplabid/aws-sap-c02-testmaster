window.TestMaster = window.TestMaster || {};

window.TestMaster.viewHelpers = (function createViewHelpersModule() {
  function renderQuestion(question, elements, options = {}) {
    if (!question || !elements.prompt || !elements.form) {
      elements.prompt.textContent = "Question not available.";
      elements.type.textContent = "";
      return;
    }

    clearElement(elements.meta);
    clearElement(elements.form);

    elements.prompt.textContent = question.prompt;
    elements.type.textContent = question.type === "multiple"
      ? "Select all correct answers"
      : "Select one answer";

    renderMeta(question, elements.meta, options.metaPrefix);

    question.options.forEach((option) => {
      const label = document.createElement("label");
      label.className = "answer-option";
      label.dataset.optionId = option.id;

      const input = document.createElement("input");
      input.type = question.type === "multiple" ? "checkbox" : "radio";
      input.name = options.inputName || "answer";
      input.value = option.id;

      if (Array.isArray(options.checked) && options.checked.includes(option.id)) {
        input.checked = true;
      }

      const optionText = document.createElement("span");
      const optionId = document.createElement("strong");
      optionId.textContent = option.id;

      optionText.appendChild(optionId);
      optionText.append(option.text);

      label.appendChild(input);
      label.appendChild(optionText);
      elements.form.appendChild(label);
    });
  }

  function renderMeta(question, container, prefix) {
    const chips = [
      prefix,
      question.domain,
      question.difficulty,
      question.type === "multiple" ? "Multiple answer" : "Single answer",
      ...(question.tags || [])
    ];

    chips.filter(Boolean).forEach((value) => {
      const chip = document.createElement("span");
      chip.className = "meta-chip";
      chip.textContent = value;
      container.appendChild(chip);
    });
  }

  function applyAnswerHighlights(question, selectedAnswers, formElement) {
    const correctAnswers = question.correctAnswers;

    formElement.querySelectorAll(".answer-option").forEach((optionElement) => {
      const optionId = optionElement.dataset.optionId;
      const isSelected = selectedAnswers.includes(optionId);
      const isCorrect = correctAnswers.includes(optionId);

      optionElement.classList.remove("correct", "wrong", "missed");

      if (isCorrect && isSelected) {
        optionElement.classList.add("correct");
      } else if (isCorrect && !isSelected) {
        optionElement.classList.add("missed");
      } else if (!isCorrect && isSelected) {
        optionElement.classList.add("wrong");
      }
    });
  }

  function isAnswerCorrect(correctAnswers, selectedAnswers) {
    if (!Array.isArray(correctAnswers) || !Array.isArray(selectedAnswers)) {
      return false;
    }
    if (correctAnswers.length !== selectedAnswers.length) {
      return false;
    }

    const sortedCorrect = [...correctAnswers].sort();
    const sortedSelected = [...selectedAnswers].sort();

    return sortedCorrect.every((answerId, index) => answerId === sortedSelected[index]);
  }

  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  /**
   * Lists the built-in set1 question bank plus any sets that have been
   * written to data/ via the Upload feature's File System Access flow.
   */
  function getAvailableQuestionSets() {
    const fileSets = window.TestMaster.fileSets;
    const knownFiles = fileSets ? fileSets.getKnownSets() : [];

    return [
      { key: "set1", name: "Official AWS Practice Questions" },
      ...knownFiles.map((fileName) => ({
        key: fileName.replace(/\.json$/i, ""),
        name: `Uploaded Set (${fileName})`
      }))
    ];
  }

  /**
   * Fills a <select> element with the available question sets, preserving
   * the previously selected value when it's still a valid option.
   */
  function populateSetSelector(selectElement) {
    if (!selectElement) return;

    const sets = getAvailableQuestionSets();
    const previousValue = selectElement.value;

    clearElement(selectElement);
    sets.forEach((set) => {
      const option = document.createElement("option");
      option.value = set.key;
      option.textContent = set.name;
      selectElement.appendChild(option);
    });

    if (previousValue && sets.some((set) => set.key === previousValue)) {
      selectElement.value = previousValue;
    }
  }

  /**
   * Resolves a set selector's key ("set1", "set2", ...) to the JSON file
   * path the question engine should fetch.
   */
  function resolveQuestionSetSource(setKey) {
    return setKey === "set1" ? "data/set1.json" : `data/${setKey}.json`;
  }

  return {
    renderQuestion,
    renderMeta,
    applyAnswerHighlights,
    isAnswerCorrect,
    clearElement,
    getAvailableQuestionSets,
    populateSetSelector,
    resolveQuestionSetSource
  };
})();