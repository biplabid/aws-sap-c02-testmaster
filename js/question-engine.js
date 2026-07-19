window.TestMaster = window.TestMaster || {};

window.TestMaster.questionEngine = (function createQuestionEngineModule(storage) {
  // Fallback questions used only if a question set fails to load entirely.
  const DEFAULT_QUESTIONS = [
    {
      id: "fallback-001",
      type: "single",
      prompt: "Which AWS service provides a fully managed NoSQL database?",
      options: [
        { id: "A", text: "Amazon DynamoDB" },
        { id: "B", text: "Amazon RDS" },
        { id: "C", text: "Amazon Redshift" },
        { id: "D", text: "Amazon EMR" }
      ],
      correctAnswers: ["A"],
      domain: "General",
      difficulty: "easy",
      tags: [],
      explanation: "Amazon DynamoDB is a fully managed, serverless NoSQL database service."
    },
    {
      id: "fallback-002",
      type: "multiple",
      prompt: "Which two AWS services help distribute traffic across multiple targets?",
      options: [
        { id: "A", text: "Elastic Load Balancing" },
        { id: "B", text: "Amazon Route 53" },
        { id: "C", text: "AWS CloudTrail" },
        { id: "D", text: "AWS Config" }
      ],
      correctAnswers: ["A", "B"],
      domain: "General",
      difficulty: "easy",
      tags: [],
      explanation: "Elastic Load Balancing and Route 53 can both distribute traffic across multiple targets or endpoints."
    }
  ];

  let loadedQuestions = [];
  let loadedSetKey = null;

  /**
   * Normalizes a raw question object from any supported source shape into
   * the canonical shape used across the app:
   * { id, type: "single"|"multiple", prompt, options: [{id, text}],
   *   correctAnswers: [...], domain, difficulty, tags: [...], explanation }
   */
  function normalizeQuestion(raw, index) {
    if (!raw || typeof raw !== "object") {
      return null;
    }

    const metadata = raw.metadata || {};

    const prompt = raw.prompt || raw.question || raw.text || "";
    const rawType = (raw.type || "single").toString().toLowerCase();
    const type = rawType.startsWith("multi") ? "multiple" : "single";

    const options = (raw.options || []).map((option, optionIndex) => {
      if (typeof option === "string") {
        return { id: String.fromCharCode(65 + optionIndex), text: option };
      }
      return {
        id: option.id || option.letter || String.fromCharCode(65 + optionIndex),
        text: option.text || ""
      };
    });

    let correctAnswers = raw.correctAnswers || raw.answer || raw.answers || [];
    if (!Array.isArray(correctAnswers)) {
      correctAnswers = String(correctAnswers).split(",").map((value) => value.trim());
    }
    correctAnswers = correctAnswers.map((value) => String(value).trim().toUpperCase()).filter(Boolean);

    const domain = raw.domain || metadata.domain || "General";
    const difficulty = raw.difficulty || metadata.difficulty || "medium";
    const tags = raw.tags || metadata.tags || [];
    const explanation = raw.explanation || metadata.explanation || "";

    if (!prompt || options.length === 0 || correctAnswers.length === 0) {
      return null;
    }

    return {
      id: raw.id !== undefined && raw.id !== null ? String(raw.id) : `q-${index + 1}`,
      type,
      prompt,
      options,
      correctAnswers,
      domain,
      difficulty,
      tags,
      explanation
    };
  }

  function normalizeCollection(rawQuestions) {
    return rawQuestions
      .map((raw, index) => normalizeQuestion(raw, index))
      .filter(Boolean);
  }

  async function fetchQuestionSet(path) {
    const response = await fetch(path);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const rawQuestions = Array.isArray(data) ? data : (data.questions || []);
    return rawQuestions;
  }

  /**
   * Loads a question set. `source` may be:
   *  - a path/URL to a JSON file (default question banks)
   *  - "custom_set_N" to load a previously uploaded set from storage
   *  - the DEFAULT_QUESTIONS array itself, used as an explicit fallback
   */
  async function loadQuestions(source) {
    try {
      let rawQuestions;

      if (Array.isArray(source)) {
        rawQuestions = source;
      } else if (typeof source === "string" && source.startsWith("custom_set_")) {
        rawQuestions = (storage && storage.get(source, [])) || [];
      } else {
        rawQuestions = await fetchQuestionSet(source);
      }

      const normalized = normalizeCollection(rawQuestions);
      loadedQuestions = normalized.length > 0 ? normalized : normalizeCollection(DEFAULT_QUESTIONS);
      loadedSetKey = typeof source === "string" ? source : "default";
      return loadedQuestions;
    } catch (error) {
      console.error(`Failed to load question set from '${source}'. Falling back to default questions.`, error);
      loadedQuestions = normalizeCollection(DEFAULT_QUESTIONS);
      loadedSetKey = "default";
      return loadedQuestions;
    }
  }

  function getQuestions() {
    return loadedQuestions.slice();
  }

  function getActiveSetKey() {
    return loadedSetKey;
  }

  function shuffle(list) {
    const result = list.slice();
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function randomSelection(count) {
    return shuffle(loadedQuestions).slice(0, count);
  }

  return {
    DEFAULT_QUESTIONS,
    loadQuestions,
    getQuestions,
    getActiveSetKey,
    shuffle,
    randomSelection
  };
})(window.TestMaster.storage);
