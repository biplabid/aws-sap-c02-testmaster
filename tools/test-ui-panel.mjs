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
let lastRequest = null;
window.fetch = async (url, init) => {
  lastRequest = { url: String(url), body: JSON.parse(init.body) };
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: "### 🎯 EXAM TIP\n\nStub answer." } }] }),
  };
};
// Seed the key through storage.js rather than raw localStorage: it namespaces
// every key with an app prefix, so a raw write is invisible to the Coach.

for (const s of ["js/storage.js", "js/config.js", "js/ai-panel.js", "js/ai-coach.js"]) {
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
