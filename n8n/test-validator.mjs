/**
 * Runs the workflow's real validator code against the five hand-written gold
 * standard tips and a set of deliberately bad tips, with no API calls.
 *
 * If the validator rejects a gold tip, it is miscalibrated and Phase 1 would
 * burn tokens fighting it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const REPO = fileURLToPath(new URL("..", import.meta.url));
const wf = JSON.parse(readFileSync(`${REPO}/n8n/exam-tip-agent.workflow.json`, "utf8"));
const validateSrc = wf.nodes.find(n => n.name === "Validate Tip").parameters.jsCode;

// Use the workflow's REAL Job Config rather than a hardcoded stub, so this test
// cannot drift from the thresholds that will actually run.
const jobConfigSrc = wf.nodes.find(n => n.name === "Job Config").parameters.jsCode;
const REAL_CFG = new Function(jobConfigSrc)()[0].json;
console.log(`(using real Job Config: maxWords=${REAL_CFG.maxWords}, model=${REAL_CFG.model})\n`);

// --- load the five real questions the gold tips were written from -----------
const pick = [
  ["set5.json", "4"], ["set17.json", "5"], ["set2.json", "8"],
  ["set13.json", "10"], ["set26.json", "5"],
];

const normalize = (q) => {
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
};

const questions = {};
for (const [file, id] of pick) {
  const raw = JSON.parse(readFileSync(`${REPO}/data/${file}`, "utf8"));
  const arr = Array.isArray(raw) ? raw : raw.questions || [];
  const q = arr.find(x => String(x.id) === id);
  if (!q) throw new Error(`missing ${file}#${id}`);
  questions[`${file}#${id}`] = normalize(q);
}

// --- the five gold tips, copied verbatim from prompts/gold-standard-tips.md -
const gold = {
  "set5.json#4": {
    id: "4",
    trigger: 'slow uploads and timeouts from users far from the bucket\u2019s Region',
    answer: "Multipart upload plus S3 Transfer Acceleration endpoints",
    trap: "CloudFront is the reflex pick for latency, but it accelerates downloads from an origin \u2014 it does not speed uploads to a bucket.",
    memory_hook: "downloads = CloudFront, uploads = Transfer Acceleration",
    confidence: "high", needsReview: false,
  },
  "set17.json#5": {
    id: "5",
    trigger: "SNS fanning out to many Lambdas that all write to one RDS instance, slow at peak",
    answer: "RDS Proxy to pool connections AND an SQS queue per Lambda to absorb the burst",
    trap: "Read replicas don't help \u2014 the bottleneck is write connections, not read load. Fixing only one of the two leaves the other bottleneck in place.",
    memory_hook: "Lambda + RDS = Proxy; burst + RDS = queue first",
    confidence: "high", needsReview: false,
  },
  "set2.json#8": {
    id: "8",
    trigger: 'repeatedly querying the same DynamoDB data, read-heavy, "least application code change"',
    answer: "DynamoDB Accelerator (DAX) \u2014 swap in the DAX client",
    trap: "ElastiCache caches too, but you must write the cache-check logic yourself; On-Demand just pays more for the same repeated reads.",
    memory_hook: "DynamoDB's own cache = DAX",
    confidence: "low", needsReview: true,
  },
  "set13.json#10": {
    id: "10",
    trigger: "two SSL certificates on a single EC2 instance with no load balancer",
    answer: "Multiple ENIs, each with its own Elastic IP \u2014 one certificate bound per IP",
    trap: "Security group and NACL rules are about who may connect, not which certificate is served; and an instance cannot attach multiple subnets.",
    memory_hook: "one cert per IP, one IP per ENI",
    confidence: "high", needsReview: false,
  },
  "set26.json#5": {
    id: "5",
    trigger: "Aurora Serverless v1 needing cross-Region DR at a 2-minute RPO",
    answer: "Convert to multi-Region Aurora MySQL for continuous replication, with SAM redeploying the app in the standby Region",
    trap: "Snapshot replication and a 2-minute custom Lambda copy are both batch jobs \u2014 their RPO is the interval, so they can't beat 2 minutes. Only continuous replication can.",
    memory_hook: "RPO in minutes = continuous replication, never snapshots",
    confidence: "high", needsReview: false,
  },
};

// --- deliberately bad tips, each targeting one validator rule ---------------
const badCases = [
  ["too long", "set13.json#10", { ...gold["set13.json#10"],
    trap: "Security group and NACL rules are about who may connect rather than which certificate is actually served to the client on the wire, and separately an EC2 instance simply cannot attach multiple subnets at once, nor does a NAT address have anything whatsoever to do with certificate binding in any configuration." }],
  ["no AWS service in answer", "set13.json#10", { ...gold["set13.json#10"],
    answer: "Use several network cards with their own addresses" }],
  ["invented trigger", "set13.json#10", { ...gold["set13.json#10"],
    trigger: "a company wants to improve overall performance" }],
  ["trap names no distractor", "set13.json#10", { ...gold["set13.json#10"],
    trap: "Be careful with options that look similar to each other." }],
  ["meta-language", "set13.json#10", { ...gold["set13.json#10"],
    trap: "The correct answer is D because option B is wrong." }],
  ["hedging", "set13.json#10", { ...gold["set13.json#10"],
    trap: "It depends on the setup, but multiple subnets possibly will not work." }],
  ["unflagged despite no explanation", "set2.json#8", { ...gold["set2.json#8"],
    confidence: "high", needsReview: false }],
];

// --- build a fake n8n context and evaluate the real validator --------------
function runValidator(tipsById, questionList) {
  const cfg = REAL_CFG;
  const nodeData = {
    "Job Config": [{ json: cfg }],
    "Prepare Chunk": questionList.map(q => ({ json: { question: q } })),
  };
  const $ = (name) => ({
    first: () => nodeData[name][0],
    all: () => nodeData[name],
  });
  const $input = {
    all: () => Object.values(tipsById).map(tip => ({
      json: { content: [{ type: "text", text: JSON.stringify(tip) }], usage: {} },
    })),
  };
  const fn = new Function("$", "$input", "Buffer", validateSrc);
  return fn($, $input, Buffer);
}

let failures = 0;
console.log("=== GOLD STANDARDS (all must pass) ===");
for (const [key, tip] of Object.entries(gold)) {
  const q = questions[key];
  const res = runValidator({ [key]: tip }, [q]);
  const r = res[0].json;
  const verdict = r._valid ? "PASS" : "REJECTED";
  if (!r._valid) failures++;
  console.log(`  ${verdict.padEnd(9)} ${key.padEnd(16)} ${r._valid ? "" : JSON.stringify(r._violations)}`);
}

console.log("\n=== BAD TIPS (all must be rejected, for the right reason) ===");
for (const [label, key, tip] of badCases) {
  const q = questions[key];
  const res = runValidator({ x: tip }, [q]);
  const r = res[0].json;
  const caught = !r._valid;
  if (!caught) failures++;
  console.log(`  ${(caught ? "CAUGHT" : "MISSED").padEnd(9)} ${label.padEnd(32)} ${JSON.stringify(r._violations)}`);
}

console.log(failures ? `\n${failures} CALIBRATION PROBLEM(S)` : "\nvalidator correctly calibrated");
process.exit(failures ? 1 : 0);
