#!/usr/bin/env node
/**
 * Generate exam tips locally — the same pipeline as the n8n workflow, without
 * the round-trip.
 *
 * It deliberately does NOT reimplement the validator. It reads the validator
 * source straight out of n8n/exam-tip-agent.workflow.json, so the local run
 * and the n8n run apply identical rules by construction. Edit the rules in
 * n8n/build-workflow.mjs, re-run it, and both change together.
 *
 * Usage (PowerShell):
 *   $env:ANTHROPIC_API_KEY = "sk-ant-..."
 *   & "C:\Program Files\nodejs\node.exe" tools/generate-tips.mjs --set set1.json --offset 0 --size 15 --dry
 *
 * Flags:
 *   --set <file>       question set in data/        (default set1.json)
 *   --offset <n>       first question index         (default 0)
 *   --size <n>         how many to generate         (default 15, 0 = all)
 *   --model <id>       override the model
 *   --effort <level>   low | medium | high          (default from Job Config)
 *   --concurrency <n>  parallel requests            (default 4)
 *   --dry              do not write the tips file
 *   --quiet            summary only
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const REPO = fileURLToPath(new URL("..", import.meta.url));

// ---------------------------------------------------------------- args ----
const argv = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name) => argv.includes(`--${name}`);

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set.\n" +
    "  PowerShell:  $env:ANTHROPIC_API_KEY = '<your real key>'\n" +
    "  bash:        export ANTHROPIC_API_KEY='<your real key>'");
  process.exit(2);
}

// Catch the obvious shapes up front rather than spending 15 identical 401s on
// them. Never print the key itself - only what is wrong with it.
{
  const problems = [];
  if (API_KEY.includes("...")) problems.push('contains "..." - looks like a pasted placeholder, not a real key');
  if (/^["'].*["']$/.test(API_KEY)) problems.push("is wrapped in quotes - PowerShell kept them as part of the value");
  if (!API_KEY.startsWith("sk-ant-")) problems.push('does not start with "sk-ant-"');
  if (API_KEY.trim() !== API_KEY) problems.push("has leading or trailing whitespace");
  if (API_KEY.length < 40) problems.push(`is only ${API_KEY.length} characters, which is too short`);

  if (problems.length) {
    console.error("ANTHROPIC_API_KEY looks wrong before we even call the API:");
    for (const p of problems) console.error(`  - it ${p}`);
    console.error("\nCreate a key at https://console.anthropic.com/settings/keys and set it with:");
    console.error("  $env:ANTHROPIC_API_KEY = '<paste the key here>'");
    console.error("\nSet it in the SAME terminal you run this script from - $env: vars do not");
    console.error("cross terminal windows, and they are lost when the window closes.");
    process.exit(2);
  }
}

// ------------------------------------------------- config + validator ----
// Both come from the workflow, so there is exactly one definition of each.
const wf = JSON.parse(readFileSync(join(REPO, "n8n/exam-tip-agent.workflow.json"), "utf8"));
const nodeSrc = (name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
const cfg = new Function(nodeSrc("Job Config"))()[0].json;

cfg.setFile = arg("set", cfg.setFile);
cfg.offset = Number(arg("offset", cfg.offset));
cfg.size = Number(arg("size", cfg.size));
cfg.model = arg("model", cfg.model);
cfg.effort = arg("effort", cfg.effort);
const CONCURRENCY = Number(arg("concurrency", 4));
const QUIET = flag("quiet");

const persona = readFileSync(join(REPO, "prompts/exam-tip-persona.md"), "utf8");

// ------------------------------------------------------------ questions ----
const rawSet = JSON.parse(readFileSync(join(REPO, "data", cfg.setFile), "utf8"));
const allRaw = Array.isArray(rawSet) ? rawSet : rawSet.questions || [];

// Mirrors js/question-engine.js, as the workflow's Prepare Chunk node does.
const normalize = (q, i) => {
  const options = (q.options || []).map((o, oi) =>
    typeof o === "string"
      ? { id: String.fromCharCode(65 + oi), text: o }
      : { id: o.id || o.letter || String.fromCharCode(65 + oi), text: o.text || "" });
  let correct = q.correctAnswers || q.answer || q.answers || [];
  if (!Array.isArray(correct)) correct = String(correct).split(",");
  correct = correct.map((v) => String(v).trim().toUpperCase()).filter(Boolean);
  const explanation = String(q.explanation || "").trim();
  return {
    id: q.id !== undefined && q.id !== null ? String(q.id) : `q-${i + 1}`,
    type: q.type || (correct.length > 1 ? "multiple" : "single"),
    domain: q.domain || "General",
    prompt: q.question || q.prompt || "",
    options,
    correctAnswers: correct,
    explanation,
    hasExplanation: explanation.length > 0,
  };
};

const end = cfg.size > 0 ? cfg.offset + cfg.size : allRaw.length;
const questions = allRaw.slice(cfg.offset, end).map(normalize);
if (!questions.length) {
  console.error(`Empty chunk: offset ${cfg.offset} is past the end of ${cfg.setFile} (${allRaw.length} questions)`);
  process.exit(2);
}

// The validator closes over $('Job Config') and $('Prepare Chunk'); give it the
// same shape n8n would.
const nodeData = {
  "Job Config": [{ json: cfg }],
  "Prepare Chunk": questions.map((q) => ({ json: { question: q } })),
};
const $ = (name) => ({ first: () => nodeData[name][0], all: () => nodeData[name] });
const runValidator = (apiResponses) =>
  new Function("$", "$input", "Buffer", nodeSrc("Validate Tip"))(
    $, { all: () => apiResponses.map((r) => ({ json: r })) }, Buffer);

// ------------------------------------------------------------ the call ----
const SCHEMA = {
  type: "object",
  properties: {
    id: { type: "string" },
    trigger: { type: "string" },
    answer: { type: "string" },
    trap: { type: "string" },
    memory_hook: { type: "string" },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
    needsReview: { type: "boolean" },
  },
  required: ["id", "trigger", "answer", "trap", "memory_hook", "confidence", "needsReview"],
  additionalProperties: false,
};

async function callClaude(messages) {
  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    output_config: { effort: cfg.effort, format: { type: "json_schema", schema: SCHEMA } },
    system: [{ type: "text", text: persona, cache_control: { type: "ephemeral" } }],
    messages,
  };

  for (let attempt = 1; attempt <= 4; attempt++) {
    let res;
    try {
      res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (e) {
      if (attempt === 4) return { error: `network: ${e.message}` };
      await sleep(1000 * attempt);
      continue;
    }

    // 429 and 5xx are transient; back off rather than losing the question.
    if (res.status === 429 || res.status >= 500) {
      if (attempt === 4) return { error: `${res.status} after ${attempt} attempts` };
      const retryAfter = Number(res.headers.get("retry-after")) || attempt * 2;
      await sleep(retryAfter * 1000);
      continue;
    }

    const json = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = json?.error?.message || `HTTP ${res.status}`;
      return { error: `${json?.error?.type || res.status}: ${msg}` };
    }
    return { response: json };
  }
  return { error: "exhausted retries" };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --------------------------------------------------------- per question ----
const usage = { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 };
const tally = (u) => {
  if (!u) return;
  usage.in += u.input_tokens || 0;
  usage.out += u.output_tokens || 0;
  usage.cacheRead += u.cache_read_input_tokens || 0;
  usage.cacheWrite += u.cache_creation_input_tokens || 0;
};

async function generateFor(q) {
  const first = await callClaude([{ role: "user", content: JSON.stringify(q, null, 2) }]);
  if (first.error) return { q, error: first.error, attempts: 1 };
  tally(first.response.usage);

  let [res] = runValidator([first.response]);
  if (res.json._valid) return { q, tip: res.json._tip, attempts: 1, violations: [] };

  // Retry as a correction turn naming the violations, not a blind re-roll.
  const prior = res.json._tip;
  const violations = res.json._violations || [];
  const correction = [
    "Your previous tip for this question was rejected by the validator.",
    "",
    "Previous attempt:",
    JSON.stringify(prior, null, 2),
    "",
    "Validator violations — fix every one:",
    ...violations.map((v) => `- ${v}`),
    "",
    "Re-read section 5 of your instructions, especially the length table.",
    "Return only the corrected JSON object.",
  ].join("\n");

  const second = await callClaude([
    { role: "user", content: JSON.stringify(q, null, 2) },
    { role: "assistant", content: JSON.stringify(prior) },
    { role: "user", content: correction },
  ]);
  if (second.error) {
    return { q, tip: prior, attempts: 2, violations, error: second.error, flagged: true };
  }
  tally(second.response.usage);

  [res] = runValidator([second.response]);
  const tip = res.json._tip || prior;
  if (!res.json._valid && tip) {
    tip.confidence = "low";
    tip.needsReview = true;
  }
  return { q, tip, attempts: 2, violations: res.json._violations || [], flagged: !res.json._valid };
}

// ------------------------------------------------------------- run pool ----
async function pool(items, n, worker) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await worker(items[i], i);
    }
  }));
  return out;
}

console.log(`\nGenerating ${questions.length} tips from ${cfg.setFile} [${cfg.offset}-${cfg.offset + questions.length - 1}]`);
console.log(`  model ${cfg.model}, effort ${cfg.effort}, cap ${cfg.maxWords} words, concurrency ${CONCURRENCY}\n`);

const started = Date.now();
const results = await pool(questions, CONCURRENCY, async (q) => {
  const r = await generateFor(q);
  if (!QUIET) {
    const wc = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
    const len = r.tip ? wc(r.tip.trigger) + wc(r.tip.answer) + wc(r.tip.trap) + wc(r.tip.memory_hook) : 0;
    const status = r.error ? `ERROR ${r.error}`
      : r.flagged ? `flagged  ${r.violations.join("; ")}`
      : r.attempts > 1 ? "ok (retried)" : "ok";
    console.log(`  q${String(r.q.id).padEnd(4)} ${String(len).padStart(3)}w  ${status}`);
  }
  return r;
});

// ---------------------------------------------------------------- write ----
const errors = results.filter((r) => r.error && !r.tip);
const tips = results.filter((r) => r.tip).map((r) => ({
  id: String(r.tip.id),
  trigger: r.tip.trigger || "",
  answer: r.tip.answer || "",
  trap: r.tip.trap || "",
  memory_hook: r.tip.memory_hook || "",
  confidence: r.tip.confidence || "low",
  needsReview: r.tip.needsReview === true,
}));

const outPath = join(REPO, "data/tips", cfg.setFile);
let merged = new Map();
if (existsSync(outPath)) {
  try {
    for (const t of JSON.parse(readFileSync(outPath, "utf8"))) merged.set(String(t.id), t);
  } catch { /* corrupt or empty - rebuild */ }
}
for (const t of tips) merged.set(t.id, t);

const numeric = (v) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ""), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};
const all = [...merged.values()].sort((a, b) => numeric(a.id) - numeric(b.id));

// Same refusal the workflow makes: a partial chunk must not look complete.
if (errors.length && !flag("force")) {
  console.error(`\n${errors.length} of ${questions.length} questions produced no tip:`);
  for (const e of errors) console.error(`  q${e.q.id}: ${e.error}`);
  console.error("\nNot writing the file. Fix the cause and re-run, or pass --force to write anyway.");
}

const wrote = !flag("dry") && (!errors.length || flag("force"));
if (wrote) {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(all, null, 2) + "\n", "utf8");
}

// -------------------------------------------------------------- summary ----
const wc = (s) => String(s || "").trim().split(/\s+/).filter(Boolean).length;
const lens = tips.map((t) => wc(t.trigger) + wc(t.answer) + wc(t.trap) + wc(t.memory_hook));
const mean = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : 0;

// claude-haiku-5-5: $0.10/$0.50 per MTok, cache reads ~$0.01.
const cost = (usage.in * 0.10 + usage.out * 0.50 + usage.cacheRead * 0.01 + usage.cacheWrite * 0.125) / 1e6;

console.log("\n  SUMMARY");
console.log(`    generated ............ ${tips.length}/${questions.length}`);
console.log(`    first attempt ........ ${results.filter((r) => r.tip && r.attempts === 1).length}`);
console.log(`    needed retry ......... ${results.filter((r) => r.attempts > 1).length}`);
console.log(`    flagged for review ... ${tips.filter((t) => t.needsReview).length}`);
console.log(`    errors ............... ${errors.length}`);
console.log(`    mean length .......... ${mean} words (target 35-45, cap ${cfg.maxWords})`);
console.log(`    over cap ............. ${lens.filter((l) => l > cfg.maxWords).length}`);
console.log(`    tokens ............... in ${usage.in}, out ${usage.out}, cache read ${usage.cacheRead}, cache write ${usage.cacheWrite}`);
console.log(`    cost ................. $${cost.toFixed(4)}   (full corpus at this rate: ~$${(cost / questions.length * 1627).toFixed(2)})`);
console.log(`    elapsed .............. ${((Date.now() - started) / 1000).toFixed(1)}s`);
console.log(`    file ................. ${wrote ? outPath + ` (${all.length} tips)` : flag("dry") ? "not written (--dry)" : "NOT WRITTEN"}`);
console.log("");

process.exit(errors.length ? 1 : 0);
