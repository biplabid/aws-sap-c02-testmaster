window.TestMaster = window.TestMaster || {};

window.TestMaster.driveSync = (function createDriveSyncModule(storage, auth) {
  const FILE_NAME = "testmaster-data.json";
  const FOLDER_KEY = "drive:folder";
  const PAYLOAD_VERSION = 1;
  const SYNC_DEBOUNCE_MS = 3000;
  const RETRYABLE_STATUSES = [429, 500, 502, 503, 504];

  let pickerLoaded = false;
  let syncTimer = null;
  let syncInFlight = false;

  function getApiKey() {
    return (window.TestMaster.config && window.TestMaster.config.GOOGLE_API_KEY) || "";
  }

  function reportStatus(message, isError, folderName) {
    window.dispatchEvent(new CustomEvent("testmaster:sync-status", {
      detail: { message, isError: Boolean(isError), folderName: folderName || null }
    }));
  }

  function getFolder() {
    return storage.getUserScoped(FOLDER_KEY, null);
  }

  function saveFolder(folder) {
    storage.setUserScoped(FOLDER_KEY, folder);
  }

  function init() {
    window.addEventListener("testmaster:auth-change", (event) => {
      if (event.detail.user) {
        onSignedIn();
      } else {
        onSignedOut();
      }
    });

    window.addEventListener("testmaster:data-changed", () => {
      scheduleSync();
    });

    if (auth.getUser()) {
      onSignedIn();
    }
  }

  function onSignedIn() {
    const folder = getFolder();
    if (!folder) {
      reportStatus("Not connected to Google Drive. Choose a folder to enable sync.", false, null);
      return;
    }
    syncNow().catch((error) => {
      console.error(error);
    });
  }

  function onSignedOut() {
    if (syncTimer) {
      window.clearTimeout(syncTimer);
      syncTimer = null;
    }
    reportStatus("Not connected to Google Drive.", false, null);
  }

  function scheduleSync() {
    if (!auth.getUser() || !getFolder()) {
      return;
    }
    if (syncTimer) {
      window.clearTimeout(syncTimer);
    }
    syncTimer = window.setTimeout(() => {
      syncTimer = null;
      syncNow().catch((error) => {
        console.error(error);
      });
    }, SYNC_DEBOUNCE_MS);
  }

  // --- Drive REST helpers -------------------------------------------------

  async function driveFetch(url, options = {}, attempt = 0) {
    const token = auth.getAccessToken();
    if (!token) {
      throw new Error("Not signed in to Google.");
    }

    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      if (RETRYABLE_STATUSES.includes(response.status) && attempt < 2) {
        await new Promise((resolve) => window.setTimeout(resolve, 500 * (attempt + 1)));
        return driveFetch(url, options, attempt + 1);
      }
      const error = new Error(`Drive API request failed (${response.status}).`);
      error.status = response.status;
      throw error;
    }

    return response;
  }

  async function folderExists(folderId) {
    try {
      const response = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${folderId}?fields=id,trashed`
      );
      const data = await response.json();
      return !data.trashed;
    } catch (error) {
      if (error.status === 404) {
        return false;
      }
      throw error;
    }
  }

  async function findDataFile(folderId) {
    const query = encodeURIComponent(`name='${FILE_NAME}' and '${folderId}' in parents and trashed=false`);
    const response = await driveFetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`
    );
    const data = await response.json();
    return (data.files && data.files[0]) || null;
  }

  async function downloadDataFile(fileId) {
    const response = await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`);
    return response.json();
  }

  async function createDataFile(folderId, payload) {
    const boundary = "testmaster-boundary";
    const metadata = { name: FILE_NAME, parents: [folderId], mimeType: "application/json" };
    const body =
      `--${boundary}\r\n` +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      "Content-Type: application/json\r\n\r\n" +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}--`;

    const response = await driveFetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id",
      {
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        body
      }
    );
    return response.json();
  }

  async function updateDataFile(fileId, payload) {
    await driveFetch(
      `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }
    );
  }

  // --- Merge logic ---------------------------------------------------------

  function mergeAttemptHistory(local, remote) {
    const byId = new Map();
    [...(remote || []), ...(local || [])].forEach((entry) => {
      if (entry && entry.id) {
        byId.set(entry.id, entry);
      }
    });
    return Array.from(byId.values()).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  }

  function mergeDoneQuestions(local, remote) {
    return Array.from(new Set([...(local || []), ...(remote || [])]));
  }

  function computeStatisticsFromHistory(history) {
    if (!history.length) {
      return {
        attempts: 0,
        completedQuizAttempts: 0,
        completedMockAttempts: 0,
        totalCorrect: 0,
        totalQuestions: 0,
        bestScore: null,
        averageScore: null,
        studyTimeSeconds: 0,
        lastAttemptAt: null
      };
    }

    const attempts = history.length;
    const scores = history.map((entry) => Number(entry.score) || 0);

    return {
      attempts,
      completedQuizAttempts: history.filter((entry) => entry.type === "quiz").length,
      completedMockAttempts: history.filter((entry) => entry.type === "mock").length,
      totalCorrect: history.reduce((sum, entry) => sum + (Number(entry.correctCount) || 0), 0),
      totalQuestions: history.reduce((sum, entry) => sum + (Number(entry.totalQuestions) || 0), 0),
      bestScore: Math.max(...scores),
      averageScore: Math.round(scores.reduce((sum, score) => sum + score, 0) / attempts),
      studyTimeSeconds: history.reduce((sum, entry) => sum + (Number(entry.timeUsedSeconds) || 0), 0),
      lastAttemptAt: Math.max(...history.map((entry) => entry.completedAt || 0))
    };
  }

  function getKnownSetKeys() {
    const viewHelpers = window.TestMaster.viewHelpers;
    if (!viewHelpers) {
      return [];
    }
    return viewHelpers.getAvailableQuestionSets().map((set) => set.key);
  }

  function buildLocalDoneQuestionsMap() {
    const map = {};
    getKnownSetKeys().forEach((setKey) => {
      map[setKey] = storage.loadDoneQuestions(setKey);
    });
    return map;
  }

  // --- Sync ------------------------------------------------------------

  async function syncNow() {
    if (syncInFlight) {
      return;
    }

    const folder = getFolder();
    if (!auth.getUser() || !folder) {
      return;
    }

    syncInFlight = true;
    reportStatus("Syncing…", false, folder.name);

    try {
      const stillExists = await folderExists(folder.id);
      if (!stillExists) {
        reportStatus("Your Drive folder is no longer available. Choose it again to reconnect.", true, null);
        return;
      }

      const remoteFile = await findDataFile(folder.id);
      const remotePayload = remoteFile ? await downloadDataFile(remoteFile.id) : null;

      const localHistory = storage.loadAttemptHistory();
      const localDone = buildLocalDoneQuestionsMap();

      const mergedHistory = mergeAttemptHistory(localHistory, remotePayload && remotePayload.attemptHistory);

      const mergedDone = {};
      const allSetKeys = new Set([
        ...Object.keys(localDone),
        ...Object.keys((remotePayload && remotePayload.doneQuestions) || {})
      ]);
      allSetKeys.forEach((setKey) => {
        mergedDone[setKey] = mergeDoneQuestions(
          localDone[setKey],
          remotePayload && remotePayload.doneQuestions && remotePayload.doneQuestions[setKey]
        );
      });

      storage.saveAttemptHistory(mergedHistory);
      storage.saveStatistics(computeStatisticsFromHistory(mergedHistory));
      Object.keys(mergedDone).forEach((setKey) => {
        storage.saveDoneQuestions(setKey, mergedDone[setKey]);
      });

      const payload = {
        version: PAYLOAD_VERSION,
        updatedAt: Date.now(),
        attemptHistory: mergedHistory,
        doneQuestions: mergedDone
      };

      if (remoteFile) {
        await updateDataFile(remoteFile.id, payload);
      } else {
        await createDataFile(folder.id, payload);
      }

      window.dispatchEvent(new CustomEvent("testmaster:sync-complete"));
      reportStatus("Synced.", false, folder.name);
    } catch (error) {
      console.error(error);
      reportStatus("Sync paused — click to retry.", true, folder.name);
    } finally {
      syncInFlight = false;
    }
  }

  // --- Folder picker ---------------------------------------------------

  function ensurePickerLoaded() {
    if (pickerLoaded) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const startedAt = Date.now();

      const waitForGapi = () => {
        if (window.gapi) {
          window.gapi.load("picker", () => {
            pickerLoaded = true;
            resolve();
          });
          return;
        }
        if (Date.now() - startedAt > 10000) {
          reject(new Error("Google Picker failed to load."));
          return;
        }
        window.setTimeout(waitForGapi, 100);
      };

      waitForGapi();
    });
  }

  async function chooseFolder() {
    const token = auth.getAccessToken();
    if (!token) {
      throw new Error("Sign in with Google first.");
    }

    await ensurePickerLoaded();

    return new Promise((resolve, reject) => {
      try {
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
          .setSelectFolderEnabled(true)
          .setIncludeFolders(true);

        const builder = new window.google.picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setTitle("Choose a folder to save your TestMaster data")
          .setCallback((data) => {
            if (data.action === window.google.picker.Action.PICKED) {
              const doc = data.docs[0];
              const folder = { id: doc.id, name: doc.name };
              saveFolder(folder);
              syncNow().catch((error) => console.error(error));
              resolve(folder);
            } else if (data.action === window.google.picker.Action.CANCEL) {
              resolve(null);
            }
          });

        const apiKey = getApiKey();
        if (apiKey) {
          builder.setDeveloperKey(apiKey);
        }

        builder.build().setVisible(true);
      } catch (error) {
        reject(error);
      }
    });
  }

  function isSyncing() {
    return syncInFlight;
  }

  return {
    init,
    chooseFolder,
    syncNow,
    getFolder,
    isSyncing
  };
})(window.TestMaster.storage, window.TestMaster.auth);
