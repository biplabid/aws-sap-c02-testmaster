# AWS SAP-C02 TestMaster

**AWS SAP-C02 TestMaster** is a professional-grade practice platform for the AWS Certified Solutions Architect – Professional (SAP-C02) certification. It is designed to simulate the real exam experience while offering multiple study modes for continuous, effective preparation.

This application is built with vanilla JavaScript, HTML, and CSS, emphasizing a clean, modular, and maintainable architecture without reliance on external frameworks. It runs directly in the browser, and is also packaged as a native Windows desktop app via Electron.

## Features

The platform is organized into several practice modes, each tailored for a different study approach.

### Practice Modes

-   **Random Test**: Answer randomly selected questions one at a time with immediate feedback. Any question can be flagged **Mark as Done**, which permanently excludes it from future Random Test sessions for that question set (the flag persists across reloads). Progress can be reset per set from the intro screen.
-   **Timed Quiz**: A 20-question, 40-minute quiz that mimics a subsection of the exam, with a persistent countdown timer. Answers are saved as you progress, and the results screen lists every question with all of its answer options colour-coded (correct option selected, correct option missed, wrong option selected) and tagged with your selection, so you can see why the other options were right or wrong. Filtering to just your Correct or Incorrect answers expands each question and adds an **Explanation** toggle for the ones you got wrong.
-   **Mock Exam**: A full 75-question, 3-hour simulation of the SAP-C02 exam, with a question palette for navigation, the ability to mark questions for review, a pre-submission review screen, and a results summary showing your score and a per-question correct/wrong/unanswered/marked breakdown. As in Timed Quiz, every question in the results list shows all of its answer options with your selection and the correct answers marked, and the Correct/Incorrect tiles filter the results and add an **Explanation** toggle to each question you got wrong. Unlike Random Test and Timed Quiz, there's no set selector: each attempt combines every question bank in `data/` on the fly (with a progress bar while it fetches them) and draws a fresh, randomized 75-question paper from the combined pool, then asks you to confirm before starting.
-   **Statistics**: A dashboard with a radar chart of your score by domain, a bar chart of your most recent attempts, summary cards (attempts, average score, best score, study time), and a full attempt history table.
-   **Upload**: Import a custom question bank from a formatted `.docx` file. The file is parsed in the browser and written directly into the project's `data/` folder as a new `setN.json` file, which then appears as a selectable question set in Random Test and Timed Quiz, and is automatically folded into Mock Exam's combined pool.

### AI Study Coach

-   **Ask AI Coach button**: available in Random Test (next to every question, since it's untimed) and, for Timed Quiz and Mock Exam, only on the results screen's Correct/Incorrect revision list after you submit — never during a timed attempt itself. Clicking it docks a panel to the right, below the header — the page reflows to make room rather than covering the header or question, and clicking outside the panel (or Esc) closes it. It automatically submits the question and its answer options and shows the answer right there — no copying, no tab switching.
-   **Requires a free Groq API key**: Gemini Gems (like the shared [AWS SAP-C02 Coach](https://gemini.google.com/gem/1S3bQtUSzcI5cwtdTCmz1MWVJVPnUXAyt?usp=sharing) Gem) have no public API, so the panel instead calls [Groq's](https://groq.com/) free API, running the open-weight **Llama 3.3 70B** model with a system prompt written to match the Gem's persona. The first click prompts you to paste a key from [console.groq.com/keys](https://console.groq.com/keys) — no credit card, no cost (14,400 requests/day free); it's saved only in your browser's `LocalStorage`.
-   **Change AI coach key**: a plain-text link at the bottom of the sidebar, above the "Created by" line, opens the panel straight to the key field any time you want to update or replace it.

### Resources

-   **User Guide**: An in-app guide covering every practice mode, keyboard shortcuts, how to read your results, question sets, uploading questions, and data/privacy — no need to leave the app.
-   **Technical Architecture**: An in-app reference for contributors/maintainers: an architecture diagram, a per-module breakdown, the question data pipeline, the `LocalStorage` schema, the upload pipeline, the Google Sign-In/login-gate pipeline, and known limitations.

### Google Sign-In (Required)

-   **Animated welcome/login gate**: The app opens on a full-screen, branded welcome screen. The rest of the app — every practice mode, statistics, upload, and the docs — stays hidden until you sign in.
-   **Sign In with Google**: Click **Sign in with Google** on the welcome screen (or the header's account control once signed in) to identify yourself and unlock the app.
-   **Access is restricted**: intended for a small number of pre-approved Google accounts (configured in Google Cloud Console, not in this app's code — see [Google Sign-In Setup](#google-sign-in-setup) below).
-   **Refresh-safe sessions**: reloading the page doesn't ask you to sign in again, and won't trigger a Google account-picker popup either — the app trusts your cached profile until an explicit sign-out (manual or idle timeout), with no background re-verification to surface Google's own UI.
-   **10-minute idle auto sign-out**: with no clicks, key presses, scrolling, or mouse movement for 10 minutes, you're signed out automatically and returned to the welcome screen. This clears your cached sign-in and any in-progress Timed Quiz/Mock Exam session (so nothing lingers for the next person on this browser) — your statistics, attempt history, done-flags, and saved AI Coach key are untouched and restored the moment you sign back in.
-   **Per-account data**: progress, answers, and attempt history are saved locally in your browser, namespaced to your signed-in Google account.

### Core Functionality

-   **Responsive Design**: Fully responsive UI that adapts to desktop, tablet, and mobile devices, including an off-canvas navigation menu on smaller screens.
-   **Multiple Question Sets**: The built-in set plus any sets imported via Upload are all selectable from a dropdown in Random Test and Timed Quiz. Mock Exam instead combines all of them automatically into one pool for each attempt.
-   **State Persistence**: Exam/quiz progress, attempt history, statistics, theme preference, and per-question "done" flags are all saved to `LocalStorage` (namespaced per signed-in user, where applicable), so nothing is lost on refresh.
-   **Login-Gated Access**: The entire app is hidden behind an animated welcome screen until you sign in with Google — see [Google Sign-In (Required)](#google-sign-in-required) above.
-   **Dynamic Timers**: Each timed mode features a persistent countdown timer with visual cues for low-time warnings.
-   **Performance Analytics**: Attempt history is aggregated into domain-level scores and recent-attempt trends, visualized with Chart.js.
-   **Light & Dark Theme**: A toggle in the header switches between light and dark mode; the choice is remembered across sessions.
-   **Accessibility**: The UI is designed with accessibility in mind, including keyboard navigation, ARIA attributes, and a high-contrast dark mode.

## Tech Stack

-   **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6)
-   **Data**: Questions are loaded from JSON files, or imported from `.docx` uploads via [Mammoth.js](https://github.com/mwilliamson/mammoth.js) (extracts raw text for parsing).
-   **Storage**: `LocalStorage` API for session, statistics, theme, and progress persistence; the [File System Access API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API) (Chrome/Edge only) for writing newly uploaded question sets to disk.
-   **Auth**: [Google Identity Services](https://developers.google.com/identity/oauth2/web/guides/overview) client-side token flow, required to sign in and unlock the app.
-   **AI Coach**: [Groq API](https://console.groq.com/docs) (OpenAI-compatible chat completions), running the open-weight `llama-3.3-70b-versatile` model, called directly from the browser with a user-supplied API key — free, no credit card required.
-   **Analytics**: Chart.js for rendering performance charts.
-   **Desktop Packaging**: [Electron](https://www.electronjs.org/) wraps the app in a native window (backed by a local static server so `fetch()` and the File System Access API work exactly as they do in the browser); [electron-builder](https://www.electron.build/) produces the Windows installer and portable executable. Google Sign-In does **not** work inside this packaged app (Google blocks OAuth in embedded browsers), which means the desktop build currently cannot get past the login gate — see Known Limitations in the in-app Architecture page.
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
│   ├── account.css          # Sign-in control + account popover styling
│   ├── auth-gate.css        # Animated welcome/login-gate screen styling
│   ├── ai-panel.css         # Right-side "Ask AI Coach" panel styling
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
│   ├── ai-coach.js             # "Ask AI Coach" panel: calls the Groq API, manages the user's API key
│   ├── config.js               # Public Google OAuth Client ID + AI Coach model/prompt/Gem URL
│   ├── auth.js                  # Google Identity Services sign-in/out, access token
│   ├── auth-gate.js             # Full-screen welcome/login gate shown until signed in
│   ├── idle-logout.js           # Signs out automatically after 10 minutes of inactivity
│   ├── account-ui.js            # Header sign-in control + account popover
│   ├── utils.js                # General utility functions
│   ├── view-helpers.js        # Shared question rendering + set-selector helpers
│   ├── questions.js           # Legacy question-set helper, not currently used
│   └── question-loader.js     # Legacy single-set loader, not currently used
├── data/
│   ├── set1.json              # Bundled official question bank
│   ├── set2.json ... set13.json  # Additional bundled sets, selectable in every mode
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

Sign-in is required to get past the welcome screen — make sure `http://localhost:8000` (or whatever origin you're serving from) is added as an Authorized JavaScript origin for the OAuth Client ID in `js/config.js`; see [Google Sign-In Setup](#google-sign-in-setup) below.

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

The desktop app behaves identically to the browser version — it runs the same `index.html`/`css`/`js`/`data` against a local server inside the Electron window, including the Upload feature's file-write flow. Google Sign-In does **not** work inside it (see Tech Stack), so **the desktop build currently cannot get past the login gate** — this is a known limitation, not a bug.

## Google Sign-In Setup

Google Sign-In is required — without a configured Client ID, no one can get past the welcome screen. To set it up:

1.  **Google Cloud project**: create one at the [Google Cloud Console](https://console.cloud.google.com/).
2.  **OAuth consent screen** (APIs & Services → OAuth consent screen): User type **External**; leave publishing status as **Testing**; add scopes `openid`, `userinfo.email`, `userinfo.profile`; add each Google account that should be allowed to sign in under **Test users** (Testing mode supports up to 100 — this is how access is restricted, not app code).
3.  **OAuth Client ID** (APIs & Services → Credentials → Create Credentials → OAuth client ID): Application type **Web application**; add Authorized JavaScript origins for everywhere this runs, e.g. `https://biplabid.github.io` and `http://localhost:8000` for local testing. No redirect URI is needed — this uses the client-side token flow, not a redirect flow.
4.  Paste the generated Client ID into `js/config.js` (`GOOGLE_CLIENT_ID`). It's safe to commit — unlike a client secret, an OAuth Client ID is meant to be public.

Until a real Client ID is set, the welcome screen's "Sign in with Google" button is disabled and the app is inaccessible.

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
11. **Login Gate**: `auth-gate.js` listens for `testmaster:auth-change` and shows a full-screen animated welcome screen over the entire app shell until a user is signed in, at which point the gate hides and the app becomes usable.
12. **Per-User Data**: `storage.js` listens for `testmaster:auth-change` and namespaces `statistics`/`attempt_history`/`done_questions` by the signed-in user's Google id (everything else stays shared/guest-scoped).
13. **AI Study Coach**: "Ask AI Coach" (live in `random.js`; only in `quiz.js`/`mock.js`'s post-submission result rows) calls `aiCoach.askAboutQuestion()`, which opens the right-side panel and POSTs the question to Groq's OpenAI-compatible chat completions endpoint with a system prompt (`config.js`'s `AI_COACH_SYSTEM_PROMPT`) written to match the shared Gem's persona — Gemini Gems themselves have no public API. The user's own API key is stored in `LocalStorage` and sent directly from the browser to Groq.
14. **Idle Auto Sign-Out**: `idle-logout.js` tracks activity events on `window` and polls every 15 seconds; after 10 minutes with no activity while signed in, it calls `auth.signOut()` and sets a message on the login gate. `signOut()` clears the cached profile and any in-progress exam session (`storage.clearActiveSessions()`) but leaves per-user statistics/attempt_history/done_questions alone, so signing back in as the same user immediately shows the same history.
15. **Refresh Persistence**: `auth.getCachedUser()` synchronously reads the last-known profile from `LocalStorage`; `auth-gate.js` uses it for its very first render (before `auth.init()`'s async GIS-loading wait resolves), and `init()` itself trusts the same cached profile once it resolves rather than following up with a silent `requestAccessToken()` check — that call could still surface Google's own account-chooser popup, which is exactly what this avoids. The session only ends via an explicit sign-out.

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
-   **True Sign-In Session Persistence**: Google's client-side token flow has no refresh token, so what looks like persistence across a reload is really an indefinitely-trusted cache (`auth.getCachedUser()`), not a Google-verified session — a backend-based auth-code flow would make it a real, periodically-verified persisted session, at the cost of needing an actual backend.
-   **Desktop Sign-In**: Find a way for the packaged Electron app to complete Google OAuth (e.g. opening the system browser for the auth step) so the login gate doesn't leave the desktop build permanently locked out.
-   **AI Coach persona sync**: `AI_COACH_SYSTEM_PROMPT` in `config.js` is a hand-written approximation of the shared Gem's instructions; it'll drift if the Gem is edited. A backend proxy would also let the API key stay off the client entirely.

---

Created by [Biplab Das](https://www.linkedin.com/in/biplabd)
