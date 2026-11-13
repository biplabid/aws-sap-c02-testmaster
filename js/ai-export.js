window.TestMaster = window.TestMaster || {};

/**
 * Detach, print and Save to Drive for the AI Coach answer.
 *
 * Detaching uses a real same-origin page plus a localStorage handoff rather
 * than a blob: URL. Electron's setWindowOpenHandler denies every window.open
 * and passes the URL to the system browser, which cannot resolve a blob
 * belonging to the app's renderer — a same-origin path survives both that and
 * an ordinary browser tab.
 */
window.TestMaster.aiExport = (function createAiExportModule() {
  // Deliberately raw localStorage, not storage.js: that namespaces keys by the
  // signed-in user id, which the detached tab has not necessarily resolved yet.
  const HANDOFF_PREFIX = "testmaster:ai-export:";
  const HANDOFF_TTL_MS = 60 * 60 * 1000;

  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
  const DRIVE_UPLOAD_URL =
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";

  let driveTokenClient = null;

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** Old handoffs would otherwise accumulate in localStorage forever. */
  function pruneHandoffs() {
    const now = Date.now();
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (!key || key.indexOf(HANDOFF_PREFIX) !== 0) {
        continue;
      }
      try {
        const payload = JSON.parse(window.localStorage.getItem(key));
        if (!payload || !payload.savedAt || now - payload.savedAt > HANDOFF_TTL_MS) {
          window.localStorage.removeItem(key);
        }
      } catch (error) {
        window.localStorage.removeItem(key);
      }
    }
  }

  function titleFor(payload) {
    const stem = String((payload && payload.questionPrompt) || "AWS SAP-C02 Exam Tip").trim();
    const short = stem.length > 70 ? `${stem.slice(0, 70)}…` : stem;
    return `Exam Tip — ${short}`;
  }

  /**
   * Opens the answer in its own tab and returns true when the tab was opened.
   *
   * @param {{answerHtml: string, questionPrompt: string, questionOptions: Array, model: string}} payload
   */
  function detach(payload) {
    pruneHandoffs();

    const id = newId();
    const record = Object.assign({ savedAt: Date.now(), title: titleFor(payload) }, payload);

    try {
      window.localStorage.setItem(HANDOFF_PREFIX + id, JSON.stringify(record));
    } catch (error) {
      return false;
    }

    // Opened straight from the click handler so the popup blocker allows it.
    const opened = window.open(`detached.html?id=${encodeURIComponent(id)}`, "_blank");
    return Boolean(opened);
  }

  function readHandoff(id) {
    try {
      return JSON.parse(window.localStorage.getItem(HANDOFF_PREFIX + id));
    } catch (error) {
      return null;
    }
  }

  function print() {
    window.print();
  }

  // --- Google Drive -------------------------------------------------------
  // A token client of its own, for two reasons: the app's sign-in asks only
  // for "openid email profile" and adding Drive there would re-prompt every
  // user at sign-in, and auth.js deliberately avoids silent token requests
  // because they can surface Google's account chooser on page load. Asking
  // only when someone clicks Save to Drive keeps both of those properties.
  function getDriveTokenClient() {
    if (driveTokenClient) {
      return driveTokenClient;
    }

    const config = window.TestMaster.config || {};
    const clientId = config.GOOGLE_CLIENT_ID;

    if (!clientId || !window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      return null;
    }

    driveTokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: () => {} // replaced per request
    });

    return driveTokenClient;
  }

  function requestDriveToken() {
    return new Promise((resolve, reject) => {
      const client = getDriveTokenClient();

      if (!client) {
        reject(new Error("Google Sign-In is not available, so Drive upload can't be authorised."));
        return;
      }

      client.callback = (response) => {
        if (response && response.access_token) {
          resolve(response.access_token);
        } else {
          reject(new Error((response && response.error_description) || "Drive access was not granted."));
        }
      };

      client.error_callback = (error) => {
        reject(new Error((error && error.message) || "Drive authorisation was dismissed."));
      };

      try {
        client.requestAccessToken();
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Uploads the answer to Drive as a Google Doc.
   *
   * Uploading text/html with a target mimeType of application/vnd.google-apps
   * .document makes Drive convert it, so the result is an editable Doc with the
   * headings and tables intact — no client-side PDF library needed.
   *
   * @returns {Promise<{id: string, name: string, webViewLink: string}>}
   */
  async function saveToDrive(payload) {
    const token = await requestDriveToken();

    const name = titleFor(payload);
    const html = buildStandaloneHtml(payload);
    const boundary = `boundary${newId()}`;

    const metadata = {
      name,
      mimeType: "application/vnd.google-apps.document"
    };

    const body = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      `--${boundary}--`,
      ""
    ].join("\r\n");

    const response = await fetch(`${DRIVE_UPLOAD_URL}&fields=id,name,webViewLink`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`
      },
      body
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = (data.error && data.error.message) || `Drive upload failed (${response.status}).`;
      // The most common first-run failure is the API simply being off.
      if (/has not been used|is disabled/i.test(message)) {
        throw new Error(`${message} Enable the Drive API for this Google Cloud project, then try again.`);
      }
      throw new Error(message);
    }

    return data;
  }

  /**
   * A self-contained HTML document of the answer — used for the Drive upload
   * and by detached.html when it exports. Styles are inlined so the file reads
   * correctly outside the app.
   */
  function buildStandaloneHtml(payload) {
    const esc = (text) =>
      String(text === undefined || text === null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const options = (payload.questionOptions || [])
      .map((o) => `<li><strong>${esc(o.id)}.</strong> ${esc(o.text)}</li>`)
      .join("");

    return [
      "<!doctype html>",
      '<html lang="en"><head><meta charset="utf-8">',
      `<title>${esc(titleFor(payload))}</title>`,
      "<style>",
      "body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;line-height:1.55;color:#1f2733;max-width:46rem;margin:2rem auto;padding:0 1rem}",
      "h1{font-size:1.3rem} h2,h3,h4{margin-top:1.4rem}",
      "table{border-collapse:collapse;width:100%;margin:0.8rem 0}",
      "th,td{border:1px solid #d8dee9;padding:0.4rem 0.6rem;text-align:left;vertical-align:top}",
      "th{background:#f2f5f9}",
      "pre{background:#f6f8fa;padding:0.7rem;border-radius:6px;overflow-x:auto}",
      "code{background:#f6f8fa;padding:0.1rem 0.3rem;border-radius:4px}",
      ".question{background:#f6f8fa;border-left:3px solid #94a3b8;padding:0.8rem 1rem;border-radius:6px;margin-bottom:1.5rem}",
      ".question ol{margin:0.4rem 0 0;padding-left:1.2rem}",
      ".meta{color:#6b7685;font-size:0.82rem;margin-top:2rem;border-top:1px solid #e2e8f0;padding-top:0.7rem}",
      "</style></head><body>",
      `<h1>${esc(titleFor(payload))}</h1>`,
      payload.questionPrompt
        ? `<div class="question"><p>${esc(payload.questionPrompt)}</p>${options ? `<ol type="A">${options}</ol>` : ""}</div>`
        : "",
      payload.answerHtml || "",
      `<p class="meta">AWS SAP-C02 TestMaster — Ask AI Coach${payload.model ? ` · ${esc(payload.model)}` : ""} · ${esc(new Date().toLocaleString())}</p>`,
      "</body></html>"
    ].join("\n");
  }

  return {
    detach,
    readHandoff,
    print,
    saveToDrive,
    buildStandaloneHtml
  };
})();
