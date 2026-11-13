/**
 * Grades a generated tips file against the workflow's own validator, offline.
 *
 * Usage:
 *   node n8n/grade-tips.mjs set1.json
 *
 * This is the same validator the workflow runs, so a tip that passes here
 * passed in the run too. What it adds is a report across the whole file plus
 * the checks a per-item validator cannot see: duplicate memory hooks, tips
 * that merely restate the correct option, and flagging discipline.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const setFile = process.argv[2] || "set1.json";

const wf = JSON.parse(readFileSync(`${REPO}/n8n/exam-tip-agent.workflow.json`, "utf8"));
const validateSrc = wf.nodes.find(n => n.name === "Validate Tip").parameters.jsCode;
const cfg = new Function(wf.nodes.find(n => n.name === "Job Config").parameters.jsCode)()[0].json;

const tips = JSON.parse(readFileSync(`${REPO}/data/tips/${setFile}`, "utf8"));
const rawSet = JSON.parse(readFileSync(`${REPO}/data/${setFile}`, "utf8"));
const questions = (Array.isArray(rawSet) ? rawSet : rawSet.questions || []).map(q => {
  const options = (q.options || []).map((o, oi) =>
    typeof o === "string"
      ? { id: String.fromCharCode(65 + oi), text: o }
      : { id: o.id || o.letter || String.fromCharCode(65 + oi), text: o.text || "" });
  let correct = q.correctAnswers || q.answer || q.answers || [];
  if (!Array.isArray(correct)) correct = String(correct).split(",");
  correct = correct.map(v => String(v).trim().toUpperCase()).filter(Boolean);
  const explanation = String(q.explanation || "").trim();
  return {
    id: String(q.id), type: q.type || "single", domain: q.domain || "General",
    prompt: q.question || q.prompt || "", options, correctAnswers: correct,
    explanation, hasExplanation: explanation.length > 0,
  };
});

const byId = Object.fromEntries(questions.map(q => [q.id, q]));

// Run the workflow's validator over every tip.
const nodeData = {
  "Job Config": [{ json: cfg }],
  "Prepare Chunk": questions.map(q => ({ json: { question: q } })),
};
const $ = (name) => ({ first: () => nodeData[name][0], all: () => nodeData[name] });
const $input = {
  all: () => tips.map(t => ({
    json: { content: [{ type: "text", text: JSON.stringify(t) }], usage: {} },
  })),
};
const results = new Function("$", "$input", "Buffer", validateSrc)($, $input, Buffer);

const words = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

let pass = 0;
const rows = [];
for (let i = 0; i < tips.length; i++) {
  const t = tips[i];
  const r = results[i].json;
  const q = byId[String(t.id)];
  const extra = [];

  // Does the answer just restate the correct option verbatim rather than
  // extracting the pattern?
  if (q) {
    const correctTexts = q.options
      .filter(o => q.correctAnswers.includes(String(o.id).toUpperCase()))
      .map(o => norm(o.text));
    const a = norm(t.answer);
    if (correctTexts.some(ct => ct.length > 30 && (ct.includes(a) || a.includes(ct.slice(0, 60))))) {
      extra.push("answer restates the correct option");
    }
    // Flagging discipline, the rule that gates 167 questions.
    if (!q.hasExplanation && !(t.confidence === "low" && t.needsReview === true)) {
      extra.push("UNFLAGGED despite no explanation");
    }
  } else {
    extra.push("no matching question for this id");
  }

  const ok = r._valid && extra.length === 0;
  if (ok) pass++;
  rows.push({
    id: t.id,
    words: words(t.trigger) + words(t.answer) + words(t.trap) + words(t.memory_hook),
    conf: t.confidence,
    flag: t.needsReview ? "R" : "-",
    ok,
    issues: [...(r._violations || []), ...extra],
  });
}

// Cross-tip checks.
const hooks = tips.map(t => norm(t.memory_hook)).filter(Boolean);
const dupHooks = hooks.filter((h, i) => h && hooks.indexOf(h) !== i);

console.log(`\nGRADING  data/tips/${setFile}   (model: ${cfg.model}, maxWords: ${cfg.maxWords})\n`);
console.log("  id   words  conf   flag  verdict   issues");
console.log("  " + "-".repeat(74));
for (const r of rows) {
  console.log(
    `  ${String(r.id).padEnd(4)} ${String(r.words).padStart(5)}  ${r.conf.padEnd(6)} ${r.flag}     ` +
    `${(r.ok ? "PASS" : "FAIL").padEnd(9)} ${r.issues.join("; ")}`
  );
}

const noExpl = tips.filter(t => byId[t.id] && !byId[t.id].hasExplanation);
const avg = Math.round(rows.reduce((s, r) => s + r.words, 0) / rows.length);

console.log("\n  SUMMARY");
console.log(`    passed validator ........ ${pass}/${tips.length}`);
console.log(`    average length .......... ${avg} words (target 35-45, cap ${cfg.maxWords})`);
console.log(`    longest ................. ${Math.max(...rows.map(r => r.words))} words`);
console.log(`    flagged for review ...... ${tips.filter(t => t.needsReview).length}`);
console.log(`    questions w/o explanation ${noExpl.length}` +
            (noExpl.length ? ` (all must be flagged: ${noExpl.every(t => t.needsReview) ? "YES" : "NO - FAIL"})` : ""));
console.log(`    duplicate memory hooks .. ${dupHooks.length}`);
console.log("");
process.exit(pass === tips.length ? 0 : 1);
