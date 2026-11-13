/**
 * Loads the real index.html with the real scripts in jsdom, clicks the real
 * buttons, and inspects the request that actually goes to Groq.
 *
 * This exists because a previous bug — two modules each registering a
 * click-outside-to-close listener, so the panel shut itself the moment it
 * opened — was invisible to syntax checks and load-order checks. It only
 * appears on a real bubbling click.
 *
 * Run: npm run test:ui
 */
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));

const consoleErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => consoleErrors.push("jsdomError: " + e.message));
vc.on("error", (...a) => consoleErrors.push("error: " + a.join(" ")));

const dom = new JSDOM(readFileSync(`${REPO}index.html`, "utf8"), {
  runScripts: "outside-only",
  url: "http://127.0.0.1:5500/",
  virtualConsole: vc,
  pretendToBeVisual: true,
});
const { window } = dom;

// Capture what the Coach sends rather than calling Groq for real.
// A full answer in the prompt's own shape, so the fold is exercised against
// what the model is actually told to produce.
const FULL_ANSWER = "### 🎯 EXAM TIP\n\nDetected immediately after upload means CloudTrail data events plus EventBridge.\n\n### 📇 Pattern\n\n**ET-001 — Real-time S3 security** · CloudTrail → EventBridge\n\n### 1. Identify the Trigger Words\n\n| Question phrase | What it signals |\n|---|---|\n| Immediately after upload | Event-driven detection |\n\n### 2. Think Like the Examiner\n\nPolling cannot meet an immediacy requirement.\n\n### 3. Correct Option Identification Logic\n\nRequirement to AWS capability to service.\n\n### 4. Eliminate the Distractors\n\nThe nightly scan is periodic, so it fails the immediacy requirement.\n\n### 5. Remember This AWS Pattern\n\n- EventBridge = react to events.\n\n### 6. One-Line Memory Hook\n\nAPI activity to CloudTrail.\n\n### 7. Exam-Day Decision Rule\n\nImmediate plus object-level means data events.";

let lastRequest = null;
let driveRequest = null;
window.fetch = async (url, init) => {
  const href = String(url);
  if (href.includes("googleapis.com/upload/drive")) {
    driveRequest = { url: href, headers: init.headers, body: init.body };
    return { ok: true, json: async () => ({ id: "drive-1", name: "Exam Tip — stub", webViewLink: "https://drive.google.com/x" }) };
  }
  lastRequest = { url: href, body: JSON.parse(init.body) };
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: FULL_ANSWER } }] }),
  };
};

// window.open is not implemented in jsdom; record the call instead.
let openedUrl = null;
window.open = (url) => {
  openedUrl = String(url);
  return { focus() {} };
};

// Stand in for Google Identity Services, which the Drive token client needs.
window.google = {
  accounts: {
    oauth2: {
      initTokenClient: (cfg) => ({
        requestedScope: cfg.scope,
        callback: null,
        requestAccessToken() {
          this.callback({ access_token: "ya29.stub-token" });
        },
      }),
    },
  },
};
// Seed the key through storage.js rather than raw localStorage: it namespaces
// every key with an app prefix, so a raw write is invisible to the Coach.

for (const s of ["js/storage.js", "js/config.js", "js/ai-panel.js", "js/ai-export.js", "js/ai-coach.js"]) {
  try {
    window.eval(readFileSync(`${REPO}${s}`, "utf8"));
  } catch (e) {
    consoleErrors.push(`${s} threw on load: ${e.message}`);
  }
}

window.TestMaster.storage.set("ai-coach:groq-api-key", "gsk_dummy_key_for_test");

const TM = window.TestMaster;
TM.aiPanel.initAiPanel();
TM.aiCoach.initAiCoach();

const panel = window.document.querySelector("#aiPanel");
const isOpen = () => !panel.classList.contains("hidden");
const visibleSection = () => {
  const body = window.document.querySelector("#aiPanelBody");
  return [...body.children].filter((c) => !c.classList.contains("hidden")).map((c) => c.id).join(",") || "(none)";
};
const clickReal = (el) =>
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `   got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const QUESTION = {
  prompt: "A company must detect public S3 objects immediately after upload.",
  options: [
    { id: "A", text: "Use a nightly Lambda to scan the bucket" },
    { id: "B", text: "Use CloudTrail data events with EventBridge" },
  ],
  correctAnswers: ["B"],
  explanation: "Correct option: CloudTrail data events deliver object-level activity to EventBridge.",
};

console.log("\nPANEL + PROMPT (real DOM, real click events)\n");

check("starts closed", isOpen(), false);

const coachBtn = window.document.querySelector("#randomAiButton");
check("Ask AI Coach button exists", Boolean(coachBtn), true);

TM.aiCoach.askAboutQuestion(QUESTION);
clickReal(coachBtn);
await new Promise((r) => setTimeout(r, 20));

check("panel STAYS OPEN after Ask AI Coach click", isOpen(), true);
check("answer section is the visible one", visibleSection(), "aiPanelAnswer");

// --- what actually went to Groq -------------------------------------------
check("a request was made", Boolean(lastRequest), true);
if (lastRequest) {
  const sys = lastRequest.body.messages.find((m) => m.role === "system").content;
  const user = lastRequest.body.messages.find((m) => m.role === "user").content;

  check("system prompt is the Exam Tip Engine", sys.includes("EXAM TIP ENGINE"), true);
  check("  old persona is gone", sys.includes("High-Yield AWS SAP-C02 Exam Coach"), false);
  check("  carries the pattern catalogue", sys.includes("| ET-005 | Asynchronous decoupling | SQS |"), true);
  check("  requires a pattern line", sys.includes("### 📇 Pattern"), true);
  check("  says a tip must transfer", sys.includes("has failed"), true);

  check("user message has the question", user.includes("detect public S3 objects"), true);
  check("  has the lettered options", user.includes("B. Use CloudTrail data events"), true);
  check("  has the recorded answer", user.includes("Recorded answer: B"), true);
  check("  has the recorded explanation", user.includes("Recorded explanation:"), true);
}

// --- panel behaviour -------------------------------------------------------
clickReal(window.document.body);
check("click outside closes the panel", isOpen(), false);

TM.aiCoach.askAboutQuestion(QUESTION);
await new Promise((r) => setTimeout(r, 20));
check("reopens", isOpen(), true);
window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
check("Escape closes the panel", isOpen(), false);

// --- the "View more" fold -------------------------------------------------
TM.aiCoach.askAboutQuestion(QUESTION);
await new Promise((r) => setTimeout(r, 20));

const answerEl = window.document.querySelector("#aiPanelAnswer");
const more = answerEl.querySelector(".ai-panel-more");
const moreToggle = answerEl.querySelector(".ai-panel-more-toggle");

check("a View more toggle was added", Boolean(moreToggle), true);
check("folded content exists", Boolean(more), true);
check("folded content starts hidden", more.classList.contains("hidden"), true);
check("toggle reports collapsed", moreToggle.getAttribute("aria-expanded"), "false");

const visibleText = [...answerEl.children]
  .filter((n) => !n.classList.contains("ai-panel-more") && !n.classList.contains("ai-panel-more-toggle"))
  .map((n) => n.textContent)
  .join(" ");

check("tip is visible by default", visibleText.includes("CloudTrail data events plus EventBridge"), true);
check("pattern line is visible by default", visibleText.includes("ET-001"), true);
check("section 1 is NOT visible by default", visibleText.includes("Identify the Trigger Words"), false);
check("section 7 is NOT visible by default", visibleText.includes("Exam-Day Decision Rule"), false);
check("all 7 sections are in the fold", more.querySelectorAll("h4").length, 7);
check("toggle names the count", moreToggle.textContent, "View more (7 sections)");

clickReal(moreToggle);
check("clicking expands it", more.classList.contains("hidden"), false);
check("  toggle reports expanded", moreToggle.getAttribute("aria-expanded"), "true");
check("  label flips", moreToggle.textContent, "View less");
clickReal(moreToggle);
check("clicking again collapses it", more.classList.contains("hidden"), true);

// --- header tools: detach, print, Save to Drive ---------------------------
TM.aiCoach.askAboutQuestion(QUESTION);
await new Promise((r) => setTimeout(r, 20));

const tools = window.document.querySelector("#aiPanelTools");
check("tools appear once there is an answer", tools.classList.contains("hidden"), false);

// Detach must hand over a same-origin page, not a blob: URL — Electron sends
// window.open URLs to the system browser, which cannot resolve a blob.
clickReal(window.document.querySelector("#aiPanelDetach"));
check("detach opened a tab", Boolean(openedUrl), true);
check("  to a same-origin page", openedUrl.startsWith("detached.html?id="), true);
check("  not a blob URL", openedUrl.startsWith("blob:"), false);
check("detach closes the panel", isOpen(), false);

const handoffId = new URLSearchParams(openedUrl.split("?")[1]).get("id");
const handoff = TM.aiExport.readHandoff(handoffId);
check("handoff was stored", Boolean(handoff), true);
check("  carries the answer", handoff.answerHtml.includes("EXAM TIP"), true);
check("  carries the question", handoff.questionPrompt.includes("detect public S3 objects"), true);
check("  exports the FULL answer, not the folded view",
  handoff.answerHtml.includes("Exam-Day Decision Rule"), true);
check("  and carries no fold markup", handoff.answerHtml.includes("ai-panel-more"), false);

// Print
let printed = false;
window.print = () => { printed = true; };
TM.aiCoach.askAboutQuestion(QUESTION);
await new Promise((r) => setTimeout(r, 20));
clickReal(window.document.querySelector("#aiPanelPrint"));
check("print button calls window.print", printed, true);
check("  and leaves the panel open", isOpen(), true);

// Drive
clickReal(window.document.querySelector("#aiPanelDrive"));
await new Promise((r) => setTimeout(r, 30));
check("drive upload was attempted", Boolean(driveRequest), true);
if (driveRequest) {
  check("  uses multipart upload", driveRequest.url.includes("uploadType=multipart"), true);
  check("  sends a bearer token", String(driveRequest.headers.Authorization).startsWith("Bearer "), true);
  check("  asks Drive to convert to a Doc",
    driveRequest.body.includes("application/vnd.google-apps.document"), true);
  check("  sends the answer as HTML", driveRequest.body.includes("Content-Type: text/html"), true);
  check("  includes the rendered answer", driveRequest.body.includes("EXAM TIP"), true);
  check("  uploads the full answer", driveRequest.body.includes("Exam-Day Decision Rule"), true);
}
check("drive status is reported", window.document.querySelector("#aiPanelExportStatus").textContent.includes("Saved to Google Drive"), true);

// Asking a new question must invalidate the previous answer's tools
TM.aiCoach.askAboutQuestion(QUESTION);
check("a new request hides the tools until it answers", tools.classList.contains("hidden"), true);
await new Promise((r) => setTimeout(r, 20));

// --- the catalogue is data, not prose --------------------------------------
check("catalogue is exposed as data", Array.isArray(TM.config.EXAM_PATTERNS), true);
check("  has the seeded patterns", TM.config.EXAM_PATTERNS.length >= 8, true);
check("  every entry is complete",
  TM.config.EXAM_PATTERNS.every((p) => p.id && p.pattern && p.hook), true);
check("  every catalogue row reaches the prompt",
  TM.config.EXAM_PATTERNS.every((p) => TM.config.AI_COACH_SYSTEM_PROMPT.includes(p.id)), true);

console.log("\n  console errors during load: " + (consoleErrors.length || "none"));
for (const e of consoleErrors) console.log("    " + e);
console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nall checks passed\n");
process.exit(fails ? 1 : 0);
