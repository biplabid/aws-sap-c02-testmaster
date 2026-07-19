# AWS SAP-C02 TestMaster — Project Handoff

This document is a complete state-of-the-project summary, written to hand this codebase off to Claude Code. It covers what the app is, what was broken when this session started, what was fixed and how, how to test it (there is no build step and no browser in this environment, so a headless-DOM test harness was built for verification), and what's still open.

## 1. What this project is

A client-side, no-backend web app for practicing the AWS Certified Solutions Architect – Professional (SAP-C02) exam. Pure HTML/CSS/vanilla JS (ES6, classic `<script>` tags, no bundler, no framework). State persists in `localStorage`. Opens directly via `index.html` (or a local static server — recommended to avoid `fetch()` CORS issues on `file://`).

Four practice modes: Random Test (one question at a time, immediate feedback), Timed Quiz (20 questions / 40 minutes), Mock Exam (75 questions / 3 hours, with question palette, mark-for-review, review screen, submit confirmation), and a Statistics dashboard (Chart.js radar + bar charts, attempt history). Plus a `.docx` upload flow for adding custom question sets.

## 2. Current status

**As of this handoff, the app is fully wired and working end-to-end**, verified with a headless jsdom test harness (see §5) that actually clicks through every mode, submits answers, and checks the resulting DOM/localStorage state. All of Random Test, Timed Quiz, Mock Exam, Statistics, Dark Mode, and the `.docx` upload flow are functional with zero console errors in that harness.

This was **not** the state at the start of this session — see §4 for the full list of what was broken and why. The short version: the codebase had two half-finished, disconnected implementations (an older, well-built "shell module" architecture, and a newer, simpler "global function" pass), and nothing wired them together. Every view past Home rendered blank in a real browser.

`PROJECT_CONTEXT.md` (Phase 1–12 roadmap doc) is now **stale** — it lists Review Mode, Performance Analytics, and Dark Mode as "pending," but all three are built and working. Worth updating or deleting; left untouched this session since the ask was bug fixes, not docs.

## 3. Architecture

All modules attach to a shared global namespace, `window.TestMaster`, as IIFEs:

```
window.TestMaster.utils          js/utils.js          qs/qsa/clamp/formatPercent helpers
window.TestMaster.storage        js/storage.js        localStorage wrapper (get/set + typed helpers: saveExamSession, recordAttempt, loadStatistics, etc.)
window.TestMaster.questionEngine js/question-engine.js Question loading + normalization (added this session — see §4)
window.TestMaster.ui             js/ui.js              Hash-based router (toggles `.active` on `[data-view]`), theme toggle, keyboard shortcuts (Alt+H/R/T/M/S), toast
window.TestMaster.viewHelpers    js/view-helpers.js    renderQuestion/renderMeta/applyAnswerHighlights/isAnswerCorrect — shared question-rendering logic used by random/quiz/mock
window.TestMaster.exam           js/exam.js            Trivial appState.exam initializer
window.TestMaster.timer          js/timer.js           Countdown timer factory (start/pause/resume/reset/complete), persists to storage, survives refresh
window.TestMaster.analytics      js/analytics.js       Statistics dashboard (Chart.js radar + bar charts, history table)
window.TestMaster.random         js/random.js          Random Test mode (rewritten this session — was a stub before)
window.TestMaster.quiz           js/quiz.js            Timed Quiz mode
window.TestMaster.mock           js/mock.js            Mock Exam mode
```

Each of these (except `utils`/`storage`/`viewHelpers`) exposes an `init*Shell(appState)` (or `initNavigation()`/`initTheme()` for `ui`) function that wires up DOM event listeners against a **shared `appState` object**. Nothing runs until those init functions are called.

**`js/app.js` is the bootstrap** — the single script that actually calls all the `init*` functions, in this order:

```js
appState.questionEngine = window.TestMaster.questionEngine;
exam.initExamShell(appState);
random.initRandomShell(appState);
quiz.initQuizShell(appState);
mock.initMockShell(appState);
analytics.initAnalyticsShell(appState);
ui.initNavigation();
ui.initTheme({ storage });
```

It must load **last** in `index.html`, after every other `TestMaster.*` module is defined. `js/question-engine.js` must load **before** `question-loader.js`, `questions.js`, `quiz.js`, `mock.js`, and `random.js`, because those modules capture `window.TestMaster.questionEngine` as an IIFE constructor argument at their own script-execution time (not lazily) — if it's `undefined` at that point, it stays `undefined` forever for that module's closure.

Full current script order in `index.html` (this order matters, don't reshuffle without checking the dependency notes above):

```
utils.js → chart.js (CDN) → mammoth.js (CDN) → storage.js → question-engine.js →
questions.js → ui.js → view-helpers.js → exam.js → timer.js → analytics.js →
random.js → quiz.js → mock.js → upload.js → app.js
```

Navigation flow: `ui.js`'s `initNavigation()` listens for clicks on `[data-nav]`, toggles the `active` class on the matching `[data-view]` section (CSS: `.view{display:none} .view.active{display:block}`), and dispatches a `testmaster:view-change` CustomEvent on `window`. Every mode module (`random`, `quiz`, `mock`, `analytics`) listens for that event to know when it's been navigated to, so it can reset/render itself.

`js/question-loader.js` (`window.TestMaster.questionLoader`) exists but is **not currently used by anything** — it predates `question-engine.js` and appears to be dead/superseded code. Safe to delete, or worth folding into `question-engine.js` for clarity, but left alone this session to keep the diff minimal.

## 4. What was broken, and what was fixed this session

Found via a headless jsdom harness that actually executes the real `<script>` tags and simulates clicks (see §5) — not just reading the source.

**Navigation was broken app-wide.** `app.js` (before this session) implemented its own router that toggled a `hidden` class on view sections. But `css/style.css` only shows a view via the `active` class (`.view.active { display:block }`). Since nothing ever added `.active` except the hardcoded Home view, navigating to Random Test / Timed Quiz / Mock Exam / Statistics / Upload rendered a **completely blank content area** in a real browser. Fixed by retiring that router entirely in favor of `ui.js`'s (correct, pre-existing, but never-invoked) router.

**`window.TestMaster.questionEngine` didn't exist.** `quiz.js`, `mock.js`, and `question-loader.js` all took it as a constructor dependency, but no file defined it — so it was `undefined`, and any attempt to build a question set for Timed Quiz or Mock Exam would have thrown `TypeError: Cannot read properties of undefined`. Fixed by adding `js/question-engine.js`, which loads a question set from a path or a `custom_set_N` storage key, normalizes it into one canonical shape regardless of source format (see §6), and exposes `loadQuestions`, `getQuestions`, `shuffle`, `randomSelection`.

**`initQuizShell`, `initMockShell`, `initAnalyticsShell`, `initExamShell` were never called anywhere.** Fully-built modules, zero wiring. Clicking "Start Quiz" or "Begin Mock Exam" did nothing; the Statistics view never rendered; dark mode toggle had no listener. Fixed by writing the bootstrap in `app.js` (see §3).

**`questions.js` and `upload.js` both referenced a global `storageService` that never existed anywhere** (`storageService.getItem(...)` / `.saveItem(...)`) — a naming mismatch with the real module, `window.TestMaster.storage` (`.get`/`.set`). This threw `ReferenceError: storageService is not defined` the instant Random Test's intro screen tried to populate its question-set dropdown, and identically broke the upload flow's dependency check. Fixed by switching both files to `window.TestMaster.storage`.

**`js/random.js` was a stub, not an implementation.** The "load a question" function was literally `console.log(...)` with no rendering logic — Random Test never showed a question no matter what. Rewritten as a proper `window.TestMaster.random` module matching the `quiz.js`/`mock.js` pattern: Submit Answer → immediate feedback (correct/incorrect + explanation, via `viewHelpers.applyAnswerHighlights`) → Next Question.

**The `.docx` upload parser's regex never matched the documented question format.** It checked `line.startsWith('Question:')`, but the format (documented in the UI and in `README.md`) is `"Question 1: ..."` — which never starts with `"Question:"` literally, so no uploaded file could ever parse correctly. Fixed to `/^Question\s*\d*:/i`.

All of the above were verified fixed by re-running the harness: real question rendering, real answer submission with correct/incorrect feedback, quiz/mock timers counting down, palette + mark-for-review + review screen + submit-confirmation-modal flow in Mock Exam, Statistics populating from recorded attempts, dark mode toggling, and a full `.docx` upload → parse → save → shows up as a selectable "Custom Set" in Random Test round trip.

## 5. How to test (no browser available in this environment)

There's no build step, so "testing" here means loading `index.html` in jsdom, executing the real inlined `<script>` tags (in order, exactly as the page would), and simulating clicks/events — this is what caught every bug above; reading the source alone did not surface the navigation bug or the missing-module bug.

Key gotcha: **don't use `window.eval()` per-file** to simulate script execution — indirect eval creates an isolated lexical scope per call in V8/jsdom, so top-level `const`/`let` declared in one "script" won't be visible to a later one, which produces false-positive `ReferenceError`s that don't reflect real browser behavior. Real `<script>` tags in the same document **do** share a global lexical environment for `let`/`const` across separate tags — confirmed by comparing `window.eval()` vs actual inlined `<script>` execution in jsdom. The reliable approach: read `index.html`, replace the two CDN `<script src>` tags (Chart.js, mammoth) with inline stubs, replace each local `<script src="js/x.js">` with an inlined `<script>` containing that file's real source, then construct `new JSDOM(html, { runScripts: 'dangerously', url: 'http://localhost/...' })` and stub `window.fetch` to read from the local filesystem.

Minimal recipe (Node + `jsdom`, install with `npm install jsdom`):

```js
const fs = require('fs');
const { JSDOM } = require('jsdom');
let html = fs.readFileSync('index.html', 'utf8');
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>',
  '<script>window.Chart=function(){this.destroy=()=>{};this.update=()=>{};};</script>');
html = html.replace('<script src="https://cdn.jsdelivr.net/npm/mammoth@1.5.1/mammoth.browser.min.js"></script>',
  '<script>window.mammoth={extractRawText: async()=>({value:""})};</script>');
html = html.replace(/<script src="(js\/[^"]+\.js)"><\/script>/g,
  (m, rel) => `<script>\n${fs.readFileSync(rel, 'utf8')}\n</script>`);
const dom = new JSDOM(html, { url: 'http://localhost/index.html', runScripts: 'dangerously', pretendToBeVisual: true });
dom.window.fetch = async (url) => { /* read local files, return {ok,status,json,text} */ };
// dom.window.document.querySelector('a[data-nav="random"]').dispatchEvent(new dom.window.MouseEvent('click', {bubbles:true}));
```

From there, dispatch `MouseEvent('click', {bubbles:true, cancelable:true})` on nav links / buttons, `await` a short `setTimeout` for async question loading, and assert on `document.querySelector(...).className` / `.textContent`, or on `dom.window.localStorage`.

For `.docx` upload testing specifically: `mammoth.extractRawText` needs to be stubbed to return real sample text (can't easily fake a `.docx` file's binary content in jsdom), and `docUploader.files` needs `Object.defineProperty(input, 'files', { value: [file], configurable: true })` since jsdom (correctly) makes `.files` read-only otherwise.

There is no CI/test suite in the repo — this harness was ad hoc for this session, not committed anywhere. Worth considering turning into an actual `npm test` script if this project keeps growing.

## 6. Question data format

Two different raw shapes exist among question sources, both normalized by `question-engine.js` into one canonical shape:

```js
{
  id, type: "single"|"multiple", prompt,
  options: [{ id: "A", text: "..." }, ...],
  correctAnswers: ["A"] | ["A","C"],
  domain, difficulty, tags: [...], explanation
}
```

- `data/set1.json` (75 questions, primary bank): flat array, each item has `question` (not `prompt`), `answer` (not `correctAnswers`), `id` as a number, no `tags`.
- `data/questions.sample.json`: `{ questions: [...] }`, uses `prompt`/`correctAnswers` directly, sometimes nests `domain`/`difficulty`/`tags`/`explanation` under a `metadata` key instead of flat — inconsistent even within itself.
- Custom uploaded sets (`custom_set_N` in `localStorage`): whatever `upload.js`'s docx parser produces — `option.letter` instead of `option.id`, `answer` instead of `correctAnswers`, `type` as the raw string `"Single Choice"`/`"Multiple Choice"`.

`question-engine.js`'s `normalizeQuestion()` handles all three shapes via fallback chains (`raw.prompt || raw.question`, `raw.correctAnswers || raw.answer`, `option.id || option.letter`, `type.toLowerCase().startsWith("multi") ? "multiple" : "single"`). If you add a fourth data source, make sure it round-trips through this function.

**`.docx` upload format** (documented in-app and in `README.md`), each question block separated by `---`, minimum 50 questions per file:

```
Question 1: [text, can span multiple lines]
Type: [Single Choice/Multiple Choice]
Domain: [e.g., Design for New Solutions]
A. [option text]
B. [option text]
...
Answer: [A or A,C]
Explanation: [text, can span multiple lines]
---
```

Parsing is line-by-line (`upload.js`'s `parseDocxText`), driven by `mammoth.extractRawText()` on the uploaded `.docx`'s raw text. **Important:** when generating a `.docx` file for upload (e.g., programmatically with the `docx` npm package), every logical line must be its own `Paragraph` — do not embed `\n` inside a single `TextRun`/`Paragraph`, since Word doesn't render literal `\n` as a line break and the parser's line-by-line logic depends on real paragraph boundaries. Verified round-trip: generate → `mammoth.extractRawText` → `parseDocxText` → confirm N questions parse with valid answer letters.

## 7. This session's other deliverable: `Set - 1 (Reformatted).docx`

The user uploaded `Set - 1.docx` (16MB, 2350 paragraphs, 75 questions) — a Tutorials Dojo–style exam **review export**, not a clean question bank: each question's answer options are interleaved with UI-artifact label paragraphs (`"Correct answer"`, `"Your answer is incorrect"`, `"Correct selection"`, `"Your selection is correct/incorrect"`), the stem/options aren't structurally delimited, and the number of options per question varies (3–6, not always 4).

This was reformatted into the exact upload template above and saved as `Set - 1 (Reformatted).docx` in the project root. Parsing approach, in case a similar file needs reprocessing:

1. Split on `"Question N"` header paragraphs (handles trailing UI state like `"Question 1Incorrect"` glued onto the same paragraph).
2. Within each block, find `"Overall explanation"` (end of Q+options) and `"Domain"` (end of explanation) as section boundaries.
3. Strip label paragraphs from the options section; a label immediately **precedes** the option paragraph it describes (confirmed empirically — the label always comes right before, not after, the option it annotates).
4. To find the stem/options boundary (since option count isn't fixed at 4), cross-reference each non-labeled content line against the `"Correct option(s):"` / `"Incorrect option(s):"` bullet text in the explanation section using substring containment — a content line that appears (as an exact substring) inside one of those bullets is an option, everything before the first such line is stem.
5. Three questions (3, 41, 57) needed a manual override: the source had a minor wording/punctuation drift between the option-list version and the explanation's restatement of that same option (e.g. "Set up access" vs "Setup access", missing an Oxford comma), which broke the substring match for exactly the first option in each. Hand-verified and patched by inserting the correct option text at position A and shifting the detected correct-answer letter accordingly.
6. `Type` is derived from the count of options detected as correct (>1 → Multiple Choice), not stated explicitly anywhere in the source.

Final result: 75/75 questions parsed with 0 structural problems, answer-letter validation passed, and a full round trip through the actual (fixed) `parseDocxText` confirmed all 75 parse cleanly with correct answer letters in range. Correct-answer-count distribution (50 single / 19 double / 6 triple) matches what you'd expect from a real "select one/two/three" exam bank, which was a useful sanity check that the parsing logic wasn't systematically over- or under-matching.

## 8. Known open items / suggestions for follow-up

- `PROJECT_CONTEXT.md` is stale (see §2) — update or remove.
- `js/question-loader.js` is dead code (superseded by `js/question-engine.js`, never called) — consider deleting.
- No automated test suite committed to the repo. The jsdom harness in §5 was ad hoc; worth formalizing as `npm test` if the project keeps evolving, since there's no other safety net for a no-build vanilla-JS app like this.
- `data/set1.json` and `data/questions.sample.json` use two different raw shapes (see §6) — not a bug (both are normalized correctly), but worth standardizing on one shape for any new question sets going forward, to reduce the surface area `question-engine.js`'s normalizer has to handle.
- Only 4 exam domains appear across the 75-question bank (`Design for New Solutions`, `Design Solutions for Organizational Complexity`, `Continuous Improvement for Existing Solutions`, `Accelerate Workload Migration and Modernization`) — matches the real SAP-C02 exam's 4 domains, so this looks intentional/correct, not a gap.
- No CSS changes were needed this session — `css/dark.css` and `css/responsive.css` were already correct; the only reason dark mode and navigation looked broken was the missing JS wiring, not the stylesheets.
