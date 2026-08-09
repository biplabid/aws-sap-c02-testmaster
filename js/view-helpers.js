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
    // The question bank leads the chip row and is highlighted: in Mock Exam a
    // paper can mix banks, so it tells the candidate where each question came
    // from rather than just which set they picked.
    const chips = [
      { text: question.setName, variant: "set-chip" },
      { text: prefix },
      { text: question.domain },
      { text: question.difficulty },
      { text: question.type === "multiple" ? "Multiple answer" : "Single answer" },
      ...(question.tags || []).map((tag) => ({ text: tag }))
    ];

    chips.filter((chip) => chip.text).forEach((chip) => {
      const element = document.createElement("span");
      element.className = chip.variant ? `meta-chip ${chip.variant}` : "meta-chip";
      element.textContent = chip.text;
      container.appendChild(element);
    });
  }

  /**
   * Reads the human-readable name of the currently selected question set, for
   * stamping onto the questions drawn from it.
   */
  function getSelectedSetName(selectElement) {
    if (!selectElement || selectElement.selectedIndex < 0) {
      return "";
    }

    const option = selectElement.options[selectElement.selectedIndex];
    return option ? option.textContent.trim() : "";
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

  /**
   * Builds the post-exam answer breakdown for one result row: every option
   * of the question, with the candidate's selection and the correct answers
   * marked. Colour coding matches the practice-mode highlights — green for a
   * correct pick, orange for a correct option that was missed, red for a
   * wrong pick — so the candidate can see how the options they did not pick
   * compare with the one they did. Returns a fragment: the option list, led
   * by a note when the question was left unanswered and no option therefore
   * carries the "Your answer" tag.
   */
  function buildAnswerBreakdown(row) {
    const fragment = document.createDocumentFragment();
    const list = document.createElement("ul");
    list.className = "result-options";

    const options = Array.isArray(row.options) ? row.options : [];
    const selectedAnswers = Array.isArray(row.selectedAnswers) ? row.selectedAnswers : [];
    const correctAnswers = Array.isArray(row.correctAnswers) ? row.correctAnswers : [];

    if (selectedAnswers.length === 0) {
      const note = document.createElement("p");
      note.className = "result-options-note";
      note.textContent = "You did not answer this question.";
      fragment.appendChild(note);
    }

    options.forEach((option) => {
      const isSelected = selectedAnswers.includes(option.id);
      const isCorrect = correctAnswers.includes(option.id);

      const item = document.createElement("li");
      item.className = "result-option";

      if (isCorrect && isSelected) {
        item.classList.add("correct");
      } else if (isCorrect && !isSelected) {
        item.classList.add("missed");
      } else if (!isCorrect && isSelected) {
        item.classList.add("wrong");
      }

      const optionId = document.createElement("span");
      optionId.className = "result-option-id";
      optionId.textContent = option.id;

      const optionText = document.createElement("span");
      optionText.className = "result-option-text";
      optionText.textContent = option.text;

      const tags = document.createElement("span");
      tags.className = "result-option-tags";

      if (isSelected) {
        tags.appendChild(buildOptionTag("Your answer", "selected"));
      }

      if (isCorrect) {
        tags.appendChild(buildOptionTag("Correct answer", "correct"));
      }

      item.appendChild(optionId);
      item.appendChild(optionText);
      item.appendChild(tags);
      list.appendChild(item);
    });

    fragment.appendChild(list);
    return fragment;
  }

  function buildOptionTag(text, variant) {
    const tag = document.createElement("span");
    tag.className = `result-option-tag ${variant}`;
    tag.textContent = text;
    return tag;
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

  // Bundled sets are discovered by probing data/set1.json, data/set2.json,
  // ... in order and stopping at the first one that doesn't exist. Dropping
  // a new data/setN.json file into the project (continuing the sequence)
  // is enough to make it show up here — no code change needed.
  let builtInSetsPromise = null;

  async function fileExists(path) {
    try {
      const response = await fetch(path, { method: "HEAD" });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async function discoverBuiltInSets() {
    const sets = [];
    let index = 1;

    while (await fileExists(`data/set${index}.json`)) {
      sets.push({
        key: `set${index}`,
        name: index === 1 ? "Official AWS Practice Questions" : `Practice Set ${index}`
      });
      index += 1;
    }

    return sets;
  }

  /**
   * The question banks bundled in data/ and shipped with the app, shown to
   * every user regardless of upload history. Discovered once per page load
   * and cached.
   */
  function getBuiltInSets() {
    if (!builtInSetsPromise) {
      builtInSetsPromise = discoverBuiltInSets();
    }
    return builtInSetsPromise;
  }

  /**
   * Lists the bundled question banks plus any sets that have been written
   * to data/ via the Upload feature's File System Access flow.
   */
  async function getAvailableQuestionSets() {
    const builtInSets = await getBuiltInSets();
    const fileSets = window.TestMaster.fileSets;
    const knownFiles = fileSets ? fileSets.getKnownSets() : [];
    const builtInKeys = new Set(builtInSets.map((set) => set.key));

    const uploadedSets = knownFiles
      .map((fileName) => fileName.replace(/\.json$/i, ""))
      .filter((key) => !builtInKeys.has(key))
      .map((key) => ({ key, name: `Uploaded Set (${key}.json)` }));

    return [...builtInSets, ...uploadedSets];
  }

  /**
   * Fills a <select> element with the available question sets, preserving
   * the previously selected value when it's still a valid option.
   */
  async function populateSetSelector(selectElement) {
    if (!selectElement) return;

    const sets = await getAvailableQuestionSets();
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
    buildAnswerBreakdown,
    isAnswerCorrect,
    clearElement,
    getAvailableQuestionSets,
    getSelectedSetName,
    populateSetSelector,
    resolveQuestionSetSource
  };
})();