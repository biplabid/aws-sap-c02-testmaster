window.TestMaster = window.TestMaster || {};

window.TestMaster.questionLoader = (function createQuestionLoaderModule(questionEngine) {
  const QUESTION_SETS = {
    "set1": "data/set1.json",
    //"sample": "data/questions.sample.json"
  };

  let activeSet = "set1";
  let isLoaded = false;

  async function load(setName = activeSet) {
    if (isLoaded && setName === activeSet) {
      return questionEngine.getQuestions();
    }

    const path = QUESTION_SETS[setName] || QUESTION_SETS.set1;

    try {
      await questionEngine.loadQuestions(path);
    } catch (error) {
      console.error(`Failed to load question set '${setName}' from '${path}'. Falling back to default.`, error);
      await questionEngine.loadQuestions(questionEngine.DEFAULT_QUESTIONS);
    }

    activeSet = setName;
    isLoaded = true;
    return questionEngine.getQuestions();
  }

  function getActiveSet() {
    return activeSet;
  }

  return {
    load
  };
})(window.TestMaster.questionEngine);