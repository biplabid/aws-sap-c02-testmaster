# AWS SAP-C02 TestMaster

**AWS SAP-C02 TestMaster** is a professional-grade practice platform for the AWS Certified Solutions Architect – Professional (SAP-C02) certification. It is designed to simulate the real exam experience while offering multiple study modes for continuous, effective preparation.

This application is built with vanilla JavaScript, HTML, and CSS, emphasizing a clean, modular, and maintainable architecture without reliance on external frameworks. It runs directly in the browser, and is also packaged as a native Windows desktop app via Electron.

## Features

The platform is organized into several practice modes, each tailored for a different study approach.

### Practice Modes

-   **Random Test**: Answer randomly selected questions one at a time with immediate feedback. Any question can be flagged **Mark as Done**, which permanently excludes it from future Random Test sessions for that question set (the flag persists across reloads). Progress can be reset per set from the intro screen.
-   **Timed Quiz**: A 20-question, 40-minute quiz that mimics a subsection of the exam, with a persistent countdown timer. Answers are saved as you progress, and the results screen lets you filter to just your Correct or Incorrect answers, revealing your selected answer, the correct answer, and the explanation for each question.
-   **Mock Exam**: A full 75-question, 3-hour simulation of the SAP-C02 exam, with a question palette for navigation, the ability to mark questions for review, a pre-submission review screen, and a results summary showing your score and a per-question correct/wrong/unanswered/marked breakdown. As in Timed Quiz, the Correct/Incorrect tiles filter the results and reveal each question's selected answer, correct answer, and explanation.
-   **Statistics**: A dashboard with a radar chart of your score by domain, a bar chart of your most recent attempts, summary cards (attempts, average score, best score, study time), and a full attempt history table.
-   **Upload**: Import a custom question bank from a formatted `.docx` file. The file is parsed in the browser and written directly into the project's `data/` folder as a new `setN.json` file, which then appears as a selectable question set in every practice mode.

### Resources

-   **User Guide**: An in-app guide covering every practice mode, keyboard shortcuts, how to read your results, question sets, uploading questions, syncing with Google Drive, and data/privacy — no need to leave the app.
-   **Technical Architecture**: An in-app reference for contributors/maintainers: an architecture diagram, a per-module breakdown, the question data pipeline, the `LocalStorage` schema, the upload pipeline, the Google Sign-In/Drive sync pipeline, and known limitations.

### Google Sign-In & Google Drive Sync (Optional)

-   **Sign In with Google**: A "Sign in" control in the header lets a user optionally identify themselves — everything works with no account at all, this is purely opt-in.
-   **Sync to Your Own Google Drive**: Once signed in, a user picks (or creates) a Drive folder via Google's official folder picker. From then on, completed Timed Quiz/Mock Exam results and Random Test "Mark as Done" flags sync there automatically in the background.
-   **Historical Data Follows You**: Signing in again on a new device and reconnecting the same folder brings that history back and merges it with anything already local — nothing is silently overwritten.
-   **Access is restricted**: intended for a small number of pre-approved Google accounts (configured in Google Cloud Console, not in this app's code — see [Google Sign-In Setup](#google-sign-in-setup-optional) below).

### Core Functionality

-   **Responsive Design**: Fully responsive UI that adapts to desktop, tablet, and mobile devices, including an off-canvas navigation menu on smaller screens.
-   **Multiple Question Sets**: The built-in set plus any sets imported via Upload are all selectable from a dropdown in Random Test, Timed Quiz, and Mock Exam.
-   **State Persistence**: Exam/quiz progress, attempt history, statistics, theme preference, and per-question "done" flags are all saved to `LocalStorage` (namespaced per signed-in user, where applicable), so nothing is lost on refresh.
-   **Dynamic Timers**: Each timed mode features a persistent countdown timer with visual cues for low-time warnings.
-   **Performance Analytics**: Attempt history is aggregated into domain-level scores and recent-attempt trends, visualized with Chart.js.
-   **Light & Dark Theme**: A toggle in the header switches between light and dark mode; the choice is remembered across sessions.
-   **Accessibility**: The UI is designed with accessibility in mind, including keyboard navigation, ARIA attributes, and a high-contrast dark mode.

## Tech Stack

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6)
-   **Data**: Questions are loaded from JSON files, or imported from `.docx` uploads via [Mammoth.js](https://github.com/mwilliamson/mammoth.js) (extracts raw text for parsing).
-   **Storage**: `LocalStorage` API for session, statistics, theme, and progress persistence; the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (Chrome/Edge only) for writing newly uploaded question sets to disk.
-   **Auth & Sync**: [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/overview) for optional Google Sign-In; the [Google Drive API](https://developers.google.com/workspace/drive/api/guides/about-sdk) (`drive.file` scope, via plain `fetch()`) and the [Google Picker API](https://developers.google.com/workspace/drive/picker) for the folder-based sync, both entirely client-side.
-   **Analytics**: Chart.js for rendering performance charts.
-   **Desktop Packaging**: [Electron](https://www.electronjs.org/) wraps the app in a native window (backed by a local static server so `fetch()` and the File System Access API work exactly as they do in the browser); [electron-builder](https://www.electron.build/) produces the Windows installer and portable executable. Google Sign-In does **not** work inside this packaged app (Google blocks OAuth in embedded browsers) — the desktop build is local-only.
-   **Hosting**: deployed as a static site on [GitHub Pages](https://pages.github.com/) at <https://biplabid.github.io/aws-sap-c02-testmaster/> (no build step; Pages serves the repo root directly).

## Project Structure

The codebase is organized into modules for clear separation of concerns.

```
aws-sap-c02-testmaster/
├── index.html               # Main application shell
├── css/
│   ├── style.css            # Base styles
│   ├── dark.css             # Dark mode theme
│   ├── docs.css             # User Guide / Architecture page styling
│   ├── account.css          # Sign-in control + account/sync popover styling
│   └── responsive.css       # Responsive design rules
├── js/
│   ├── app.js                # Main application entry point
│   ├── analytics.js          # Statistics view: chart rendering and summary cards
│   ├── exam.js               # Shared exam-session state shell
│   ├── mock.js                # Mock Exam mode logic
│   ├── quiz.js                # Timed Quiz mode logic
│   ├── random.js              # Random Test mode logic (incl. Mark as Done)
│   ├── question-engine.js    # Loads, normalizes, and shuffles question sets
│   ├── file-sets.js          # Discovers/writes uploaded setN.json files on disk
│   ├── upload.js              # Parses .docx uploads into the canonical question shape
│   ├── storage.js             # LocalStorage abstraction layer + per-user namespacing
│   ├── timer.js               # Countdown timer factory
│   ├── ui.js                   # View navigation, keyboard shortcuts, theme toggle
│   ├── docs.js                 # Scroll-spy for the User Guide / Architecture table of contents
│   ├── config.js               # Public Google OAuth Client ID / API key (edit after setup)
│   ├── auth.js                  # Google Identity Services sign-in/out, access token
│   ├── drive-sync.js            # Drive REST calls, folder picker, history merge logic
│   ├── account-ui.js            # Header sign-in control + account/sync popover
│   ├── utils.js                # General utility functions
│   ├── view-helpers.js        # Shared question rendering + set-selector helpers
│   ├── questions.js           # Legacy question-set helper, not currently used
│   └── question-loader.js     # Legacy single-set loader, not currently used
├── data/
│   ├── set1.json              # Bundled official question bank
│   ├── set2.json, set3.json, set4.json, set5.json  # Additional bundled sets, selectable in every mode
│   └── questions.sample.json  # Minimal sample set
├── assets/
│   ├── icon.ico                # Windows app/installer icon
│   └── icon.png                # App window/taskbar icon, also used as the browser favicon
├── electron/
│   └── main.js                  # Electron main process: local static server + app window
├── package.json                 # Electron/electron-builder scripts and packaging config
└── README.md
```

## Getting Started

### Run in a Browser

The core app is pure client-side with no build dependencies.

1.  Clone the repository or download the source files.
2.  Serve the project root with a local static server (needed so `fetch()` can load the JSON question sets without hitting CORS restrictions):

```bash
# From the project's root directory
python -m http.server
```

3.  Navigate to `http://localhost:8000` in your browser.

For the Upload feature specifically, use **Chrome or Edge** — it relies on the File System Access API to save new question sets directly into `data/`, which other browsers don't yet support. All other features work in any modern browser.

### Run as a Desktop App (Windows)

The same app is also available as a native Windows desktop app, built with [Electron](https://www.electronjs.org/). This requires [Node.js](https://nodejs.org/).

1.  Install dependencies:

```bash
npm install
```

2.  Launch it in development mode:

```bash
npm start
```

3.  Build a distributable Windows executable:

```bash
npm run dist
```

This produces two artifacts in `dist/`:

-   **`AWS SAP-C02 TestMaster Setup <version>.exe`** — an installer that installs per-user (no admin rights required) with Desktop and Start Menu shortcuts.
-   **`AWS SAP-C02 TestMaster <version>.exe`** — a portable build that runs without installing.

The desktop app behaves identically to the browser version — it runs the same `index.html`/`css`/`js`/`data` against a local server inside the Electron window, including the Upload feature's file-write flow. Google Sign-In does **not** work inside it (see Tech Stack).

## Google Sign-In Setup (Optional)

Google Sign-In and Drive sync are entirely optional — skip this section if you're fine with local-only progress. To enable them:

1.  **Google Cloud project**: create one at the [Google Cloud Console](https://console.cloud.google.com/), then enable the **Google Drive API** under APIs & Services → Library.
2.  **OAuth consent screen** (APIs & Services → OAuth consent screen): User type **External**; leave publishing status as **Testing**; add scopes `drive.file`, `openid`, `userinfo.email`, `userinfo.profile`; add each Google account that should be allowed to sign in under **Test users** (Testing mode supports up to 100 — this is how access is restricted, not app code).
3.  **OAuth Client ID** (APIs & Services → Credentials → Create Credentials → OAuth client ID): Application type **Web application**; add Authorized JavaScript origins for everywhere this runs, e.g. `https://biplabid.github.io` and `http://localhost:8000` for local testing. No redirect URI is needed — this uses the client-side token flow, not a redirect flow.
4.  Paste the generated Client ID into `js/config.js` (`GOOGLE_CLIENT_ID`). It's safe to commit — unlike a client secret, an OAuth Client ID is meant to be public.
5.  (Only if the Drive folder picker doesn't work without it) create an **API key** restricted to the Picker API and your origin, and paste it into `js/config.js` (`GOOGLE_API_KEY`).

Until a real Client ID is set, the "Sign in" button is disabled and the rest of the app is unaffected.

## How It Works

1.  **Initialization**: `app.js` initializes all modules and sets up the main application state.
2.  **Navigation**: `ui.js` handles view switching based on URL hashes (`#random`, `#timed`, `#mock`, `#stats`, `#upload`, `#guide`, `#architecture`), keyboard shortcuts, and the dark/light theme toggle.
3.  **Question Loading**: `view-helpers.js` lists the available question sets (the bundled set plus any uploaded sets remembered by `file-sets.js`) and resolves a selected set to its JSON path; `question-engine.js` fetches, normalizes, and shuffles the questions.
4.  **Exam Modes**: Each mode (`random.js`, `quiz.js`, `mock.js`) manages its own state, user interactions, and rendering logic, building on the shared session shell in `exam.js` and helpers from `view-helpers.js`.
5.  **Custom Question Banks**: `upload.js` parses a user-provided `.docx` file (via Mammoth.js) into the application's canonical question format, then `file-sets.js` writes it to `data/` as the next `setN.json` and remembers it in `LocalStorage` so it shows up in every mode's set selector.
6.  **State Management**: `storage.js` provides a simple API for saving and retrieving data from `LocalStorage` — session progress, statistics, attempt history, theme preference, and per-question "done" flags for Random Test.
7.  **Analytics**: `analytics.js` reads attempt history from storage and uses Chart.js to render the domain radar chart and recent-attempts bar chart on the Statistics page.
8.  **Desktop Shell**: `electron/main.js` starts a local HTTP server over the project root and opens it in an Electron window, so the exact same `index.html` runs unmodified whether launched in a browser or as the packaged desktop app.
9.  **In-App Documentation**: The User Guide and Technical Architecture pages are regular views like any practice mode, styled by `css/docs.css`; `docs.js` highlights the current section in each page's table of contents as you scroll.
10. **Google Sign-In**: `auth.js` wraps Google Identity Services' client-side token flow, exposing sign-in/out and dispatching a `testmaster:auth-change` event; `account-ui.js` renders the header control and account popover from it.
11. **Per-User Data & Drive Sync**: `storage.js` listens for `testmaster:auth-change` and namespaces `statistics`/`attempt_history`/`done_questions` by the signed-in user's Google id (everything else stays shared/guest-scoped, since it's excluded from sync). `drive-sync.js` listens for `testmaster:data-changed` (dispatched from `recordAttempt`/`saveDoneQuestions`), and — once a user has picked a Drive folder via the Google Picker — debounces a background sync that merges local and cloud history by record id rather than overwriting.

## Question Upload Format

To successfully import new questions via the Upload mode, the `.docx` file must follow a strict format:

-   Each question block must be separated by three dashes (`---`).
-   The file must contain a minimum of 50 questions.

**Structure for each question:**

```
Question 1: [The question text, which can span multiple lines...]
Type: [Single Choice/Multiple Choice]
Domain: [e.g., Design for New Solutions]
A. [Option A text]
B. [Option B text]
C. [Option C text]
D. [Option D text]
...
Answer: [Correct letter(s), e.g., A or A,C]
Explanation: [Detailed explanation text, which can span multiple lines...]
---
```

On success, the parsed questions are saved directly to `data/setN.json` (the next available number) — you'll be prompted to grant the browser write access to the project's `data` folder.

## Future Improvements

-   **Mark as Done for Timed Quiz / Mock Exam**: Extend the Random Test "Mark as Done" progress tracking to the other practice modes.
-   **Cross-Device In-Progress Sessions**: Drive sync currently covers completed results and "Mark as Done" flags only; a mid-exam Timed Quiz/Mock Exam session still doesn't follow you to a different device.
-   **Sign-In Session Persistence**: Google's client-side token flow has no refresh token, so a page reload always requires a fresh (often silent, sometimes visible) re-authentication — a backend-based auth-code flow would remove this, at the cost of needing an actual backend.

---

Created by [Biplab Das](https://www.linkedin.com/in/biplabd)
