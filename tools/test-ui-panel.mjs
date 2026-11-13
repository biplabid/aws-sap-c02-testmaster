/**
 * Loads the real index.html with the real scripts in jsdom, then clicks the
 * real buttons and asserts the panel is still open afterwards.
 *
 * This is the check that was missing: the previous bug (two modules each
 * registering a click-outside-to-close listener) was invisible to syntax
 * checks and only showed up on a real click.
 */
import { readFileSync } from "node:fs";
import { JSDOM, VirtualConsole } from "jsdom";
import { fileURLToPath } from "node:url";


const REPO = fileURLToPath(new URL("..", import.meta.url));

const consoleErrors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => consoleErrors.push("jsdomError: " + e.message));
vc.on("error", (...a) => consoleErrors.push("error: " + a.join(" ")));

const html = readFileSync(`${REPO}index.html`, "utf8");

const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "http://127.0.0.1:5500/",
  virtualConsole: vc,
  pretendToBeVisual: true,
});
const { window } = dom;

// Stand in for the pieces of the environment the panel code does not own.
window.fetch = async (url) => {
  if (String(url) === "data/tips/set1.json") {
    return { ok: true, json: async () => JSON.parse(readFileSync(`${REPO}data/tips/set1.json`, "utf8")) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
window.localStorage.setItem("ai-coach:groq-api-key", "gsk_dummy_key_for_test");

// Load only the scripts this test is about, in the order index.html lists them.
const scripts = ["js/storage.js", "js/ai-panel.js", "js/ai-coach.js", "js/tip-loader.js", "js/exam-tip.js"];
for (const s of scripts) {
  try {
    window.eval(readFileSync(`${REPO}${s}`, "utf8"));
  } catch (e) {
    consoleErrors.push(`${s} threw on load: ${e.message}`);
  }
}

const TM = window.TestMaster;
TM.aiPanel.initAiPanel();
TM.aiCoach.initAiCoach();
TM.examTip.initExamTip();

const panel = window.document.querySelector("#aiPanel");
const isOpen = () => !panel.classList.contains("hidden");
const visibleSection = () => {
  const body = window.document.querySelector("#aiPanelBody");
  const shown = [...body.children].filter((c) => !c.classList.contains("hidden"));
  return shown.map((c) => c.id).join(",") || "(none)";
};

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `   got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`);
};

const clickReal = (el) => {
  // A real bubbling click, which is what exposed the bug.
  el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
};

console.log("\nPANEL BEHAVIOUR (real DOM, real click events)\n");

check("starts closed", isOpen(), false);

// 1. Ask AI Coach, from a button outside the panel
const coachBtn = window.document.querySelector("#randomAiButton");
check("Ask AI Coach button exists", Boolean(coachBtn), true);
TM.aiCoach.askAboutQuestion({ prompt: "Test question?", options: [{ id: "A", text: "Alpha" }] });
clickReal(coachBtn);
await new Promise((r) => setTimeout(r, 10));
check("panel STAYS OPEN after Ask AI Coach click", isOpen(), true);

TM.aiPanel.closePanel();
check("closes on demand", isOpen(), false);

// 2. Exam Tip, from a button outside the panel
const tipBtn = window.document.querySelector("#randomTipButton");
check("Exam Tip button exists", Boolean(tipBtn), true);
await TM.examTip.showTipFor("set1", "2");
clickReal(tipBtn);
await new Promise((r) => setTimeout(r, 10));
check("panel STAYS OPEN after Exam Tip click", isOpen(), true);
check("tip section is the visible one", visibleSection(), "aiPanelTip");

const card = window.document.querySelector("#aiPanelTip .exam-tip-card");
check("tip card rendered", Boolean(card), true);
if (card) {
  const labels = [...card.querySelectorAll(".exam-tip-label")].map((n) => n.textContent);
  check("card has all four rows", labels.join("|"), "When you see|Answer|Trap|Memory hook");
  const answer = card.querySelector(".exam-tip-row-answer .exam-tip-value");
  check("answer text came from the data file", answer.textContent.includes("DynamoDB Streams"), true);
}

// 3. Switching between the two must not leave both on screen
TM.aiCoach.askAboutQuestion({ prompt: "Another?", options: [{ id: "A", text: "Alpha" }] });
await new Promise((r) => setTimeout(r, 10));
check("switching to Coach hides the tip", visibleSection().includes("aiPanelTip"), false);

// 4. Clicking genuinely outside still closes
await TM.examTip.showTipFor("set1", "2");
await new Promise((r) => setTimeout(r, 10));
clickReal(window.document.body);
check("click outside still closes the panel", isOpen(), false);

// 5. A question with no tip
await TM.examTip.showTipFor("set1", "999");
check("missing tip shows empty state", Boolean(window.document.querySelector("#aiPanelTip .exam-tip-empty")), true);
check("  and not a card", Boolean(window.document.querySelector("#aiPanelTip .exam-tip-card")), false);

console.log("\n  console errors during load: " + (consoleErrors.length || "none"));
for (const e of consoleErrors) console.log("    " + e);
console.log(fails ? `\n${fails} FAILURE(S)\n` : "\nall panel checks passed\n");
process.exit(fails ? 1 : 0);
