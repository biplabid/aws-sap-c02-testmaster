window.TestMaster = window.TestMaster || {};

window.TestMaster.fileSets = (function createFileSetsModule(storage) {
  const INDEX_KEY = "file_sets_index";
  const SET_FILENAME_PATTERN = /^set(\d+)\.json$/i;

  let cachedDirectoryHandle = null;

  function isSupported() {
    return typeof window.showDirectoryPicker === "function";
  }

  function getKnownSets() {
    return storage.get(INDEX_KEY, []);
  }

  function rememberSet(fileName) {
    const known = getKnownSets();
    if (!known.includes(fileName)) {
      known.push(fileName);
      storage.set(INDEX_KEY, known);
    }
  }

  async function verifyPermission(handle) {
    const options = { mode: "readwrite" };

    if ((await handle.queryPermission(options)) === "granted") {
      return true;
    }

    return (await handle.requestPermission(options)) === "granted";
  }

  async function getDataDirectoryHandle() {
    if (cachedDirectoryHandle && (await verifyPermission(cachedDirectoryHandle))) {
      return cachedDirectoryHandle;
    }

    const handle = await window.showDirectoryPicker({
      id: "sap-c02-testmaster-data",
      mode: "readwrite"
    });

    if (!(await verifyPermission(handle))) {
      throw new Error("Permission to write files in the selected folder was not granted.");
    }

    cachedDirectoryHandle = handle;
    return handle;
  }

  async function getNextSetFileName(directoryHandle) {
    let maxNumber = 1;

    for await (const name of directoryHandle.keys()) {
      const match = SET_FILENAME_PATTERN.exec(name);
      if (match) {
        maxNumber = Math.max(maxNumber, Number(match[1]));
      }
    }

    return `set${maxNumber + 1}.json`;
  }

  /**
   * Writes a new question set to the project's data/ folder as the next
   * available setN.json file. Requires the user to grant folder access via
   * the browser's File System Access API (Chrome/Edge only).
   * @param {Array} questions - Canonical-shaped question objects to persist.
   * @returns {Promise<string>} The file name the questions were saved as.
   */
  async function writeQuestionSetFile(questions) {
    if (!isSupported()) {
      throw new Error(
        "Saving files directly isn't supported in this browser. Please use Chrome or Edge."
      );
    }

    const directoryHandle = await getDataDirectoryHandle();
    const fileName = await getNextSetFileName(directoryHandle);

    const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(questions, null, 2));
    await writable.close();

    rememberSet(fileName);

    return fileName;
  }

  return {
    isSupported,
    getKnownSets,
    writeQuestionSetFile
  };
})(window.TestMaster.storage);
