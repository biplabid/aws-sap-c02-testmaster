window.TestMaster = window.TestMaster || {};

/**
 * Loads pre-generated exam tips from data/tips/<set>.json.
 *
 * Tips are generated offline (see n8n/ and tools/generate-tips.mjs) and
 * committed as data files, so a lookup here is a cached fetch and a map read —
 * no API call, no key, and it works offline in the Electron build.
 *
 * A set with no tips file yet is a normal state, not an error: generation
 * happens set by set, and the Upload feature can introduce sets that were
 * never generated at all.
 */
window.TestMaster.tipLoader = (function createTipLoaderModule() {
  // setKey -> Promise<Map<questionId, tip>>. Promises rather than values so
  // concurrent callers during a single render share one fetch.
  const cache = new Map();

  /**
   * Mock Exam namespaces its question ids as "set1:14" so one paper can mix
   * banks. Random Test and Timed Quiz use the bare id and know their set.
   */
  function splitQuestionRef(setKey, questionId) {
    const raw = String(questionId === undefined || questionId === null ? "" : questionId);
    const colon = raw.indexOf(":");

    if (colon > 0) {
      return { setKey: raw.slice(0, colon), questionId: raw.slice(colon + 1) };
    }

    return { setKey: setKey || null, questionId: raw };
  }

  function loadSet(setKey) {
    if (cache.has(setKey)) {
      return cache.get(setKey);
    }

    const pending = fetch(`data/tips/${setKey}.json`)
      .then((response) => {
        if (!response.ok) {
          // 404 means "not generated yet", which is expected for most sets
          // until the bulk pass has run. Cache the empty result either way so
          // a missing file is not re-fetched on every question.
          return [];
        }
        return response.json();
      })
      .then((tips) => {
        const map = new Map();
        (Array.isArray(tips) ? tips : []).forEach((tip) => {
          if (tip && tip.id !== undefined && tip.id !== null) {
            map.set(String(tip.id), tip);
          }
        });
        return map;
      })
      .catch(() => new Map());

    cache.set(setKey, pending);
    return pending;
  }

  /**
   * Resolves to the tip object, or null when this question has none.
   */
  async function getTip(setKey, questionId) {
    const ref = splitQuestionRef(setKey, questionId);

    if (!ref.setKey || !ref.questionId) {
      return null;
    }

    const map = await loadSet(ref.setKey);
    return map.get(ref.questionId) || null;
  }

  /**
   * How many tips exist for a set — used by the docs view and for a quick
   * "is this set covered" check without pulling individual tips.
   */
  async function getCoverage(setKey) {
    const map = await loadSet(setKey);
    return map.size;
  }

  function clearCache() {
    cache.clear();
  }

  return {
    getTip,
    getCoverage,
    splitQuestionRef,
    clearCache
  };
})();
