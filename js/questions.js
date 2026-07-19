const questionService = (function () {
  const defaultSet = {
    key: 'set1',
    name: 'Official AWS Practice Questions',
    source: './data/set1.json'
  };

  /**
   * Retrieves a list of all available question sets.
   * @returns {Array} A list of question set objects {key, name}.
   */
  function getAllQuestionSets() {
    const sets = [defaultSet];
    const fileSets = window.TestMaster.fileSets;
    const knownFiles = fileSets ? fileSets.getKnownSets() : [];

    knownFiles.forEach((fileName) => {
      sets.push({
        key: fileName.replace(/\.json$/i, ''),
        name: `Uploaded Set (${fileName})`
      });
    });

    return sets;
  }

  /**
   * Loads the questions for a given set key, normalized into the canonical
   * question shape via the shared questionEngine module.
   * @param {string} setKey - The key of the set to load ('set1', 'set2', etc.).
   * @returns {Promise<Array>} A promise that resolves with the array of questions.
   */
  async function loadQuestions(setKey) {
    const source = setKey === defaultSet.key ? defaultSet.source : `data/${setKey}.json`;
    return window.TestMaster.questionEngine.loadQuestions(source);
  }

  return {
    getAllQuestionSets,
    loadQuestions
  };
})();