/**
 * Generator for n8n/exam-tip-agent.workflow.json
 *
 * The workflow's Code nodes hold real JavaScript. Embedding that directly in
 * JSON means hand-escaping every newline, which is unmaintainable — so the
 * readable source lives here and the importable JSON is generated.
 *
 * Run:  & "C:\Program Files\nodejs\node.exe" n8n/build-workflow.mjs
 *
 * Edit this file, re-run, commit both. Never hand-edit the .json.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

// --- credential names -------------------------------------------------------
// These must match the credential names created in n8n exactly.
// Both are "Header Auth" generic credentials:
//   ANTHROPIC_CRED : name = x-api-key      value = <your Anthropic API key>
//   GITHUB_CRED    : name = Authorization  value = Bearer <your GitHub PAT>
const ANTHROPIC_CRED = "Anthropic API (x-api-key)";
const GITHUB_CRED = "GitHub PAT (Authorization)";

const GH = "https://api.github.com";

// ---------------------------------------------------------------------------
// Code node bodies
// ---------------------------------------------------------------------------

const JOB_CONFIG = `
// ============================================================
//  EDIT THESE PER RUN — this is the whole control surface.
// ============================================================
const config = {
  owner:   'biplabid',
  repo:    'aws-sap-c02-testmaster',
  branch:  'fix-aws-updates',

  setFile: 'set1.json',   // which file in data/
  offset:  0,             // first question index in this chunk
  size:    15,            // how many questions this run handles

  model:   'claude-haiku-5-5',
  effort:  'low',         // low is right: the task is compression, not reasoning
  // Hard cap across trigger+answer+trap+memory_hook. 75, not 60: the reference
  // corpus itself runs to ~70 words on multi-part tips (CertTip #26), so a
  // tighter cap would reject the very style being copied. This is a guard
  // against essays, not a style constraint — the persona asks for 35-45.
  maxWords: 75,
  maxTokens: 1500,

  commit:  true,          // false = dry run, generate and report but do not commit
};
// ============================================================

return [{ json: config }];
`.trim();

const PREPARE_CHUNK = `
// Decode the three GitHub fetches, slice the chunk, and normalize each
// question into the shape the persona's section 3 documents.
const cfg = $('Job Config').first().json;

const decode = (nodeName) => {
  const r = $(nodeName).first().json;
  if (!r || !r.content) return null;
  return Buffer.from(r.content, 'base64').toString('utf8');
};

const personaText = decode('Fetch Persona');
if (!personaText) {
  throw new Error('Could not read prompts/exam-tip-persona.md from ' + cfg.branch);
}

const setText = decode('Fetch Question Set');
if (!setText) {
  throw new Error('Could not read data/' + cfg.setFile + ' from ' + cfg.branch);
}

// data/tips/<set>.json may legitimately not exist yet — a 404 is expected on
// the first run for a set, so the fetch node is set to continue on error.
let existingTips = [];
let existingSha = null;
try {
  const prev = $('Fetch Existing Tips').first().json;
  if (prev && prev.content) {
    existingSha = prev.sha;
    const parsed = JSON.parse(Buffer.from(prev.content, 'base64').toString('utf8'));
    if (Array.isArray(parsed)) existingTips = parsed;
    else if (parsed && Array.isArray(parsed.tips)) existingTips = parsed.tips;
  }
} catch (e) {
  existingTips = [];
  existingSha = null;
}

const raw = JSON.parse(setText);
const all = Array.isArray(raw) ? raw : (raw.questions || []);

const slice = all.slice(cfg.offset, cfg.offset + cfg.size);
if (slice.length === 0) {
  throw new Error('Empty chunk: offset ' + cfg.offset + ' is past the end of ' +
                  cfg.setFile + ' (' + all.length + ' questions)');
}

// Mirrors js/question-engine.js so tips key off the same ids the app uses.
const normalize = (q, i) => {
  const options = (q.options || []).map((o, oi) =>
    typeof o === 'string'
      ? { id: String.fromCharCode(65 + oi), text: o }
      : { id: o.id || o.letter || String.fromCharCode(65 + oi), text: o.text || '' }
  );

  let correct = q.correctAnswers || q.answer || q.answers || [];
  if (!Array.isArray(correct)) correct = String(correct).split(',');
  correct = correct.map(v => String(v).trim().toUpperCase()).filter(Boolean);

  const explanation = String(q.explanation || '').trim();

  return {
    id: q.id !== undefined && q.id !== null ? String(q.id) : 'q-' + (cfg.offset + i + 1),
    type: q.type || (correct.length > 1 ? 'multiple' : 'single'),
    domain: q.domain || 'General',
    prompt: q.question || q.prompt || '',
    options,
    correctAnswers: correct,
    explanation,
    hasExplanation: explanation.length > 0,
  };
};

const meta = {
  owner: cfg.owner,
  repo: cfg.repo,
  branch: cfg.branch,
  setFile: cfg.setFile,
  existingSha,
  existingTips,
  totalInFile: all.length,
};

return slice.map((q, i) => ({
  json: {
    question: normalize(q, i),
    persona: personaText,
    meta,
  },
}));
`.trim();

const BUILD_REQUEST = `
// Assemble the Anthropic request. The system prefix is the FULL persona and is
// byte-identical on every call, so it caches; only the user message varies.
// Selecting exemplars per question would vary the prefix and defeat caching.
const cfg = $('Job Config').first().json;

const SCHEMA = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    trigger:     { type: 'string' },
    answer:      { type: 'string' },
    trap:        { type: 'string' },
    memory_hook: { type: 'string' },
    confidence:  { type: 'string', enum: ['high', 'medium', 'low'] },
    needsReview: { type: 'boolean' },
  },
  required: ['id', 'trigger', 'answer', 'trap', 'memory_hook', 'confidence', 'needsReview'],
  additionalProperties: false,
};

return $input.all().map(item => {
  const q = item.json.question;

  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    output_config: {
      effort: cfg.effort,
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: [
      {
        type: 'text',
        text: item.json.persona,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      { role: 'user', content: JSON.stringify(q, null, 2) },
    ],
  };

  return { json: { ...item.json, requestBody: body, attempt: 1 } };
});
`.trim();

// Shared validator, used by both the first pass and the retry pass.
const VALIDATOR_FN = `
const cfg = $('Job Config').first().json;

// Questions are looked up by the id the model echoes back, rather than by item
// position, so a reordered or dropped response can never silently attach a tip
// to the wrong question.
const byId = {};
for (const it of $('Prepare Chunk').all()) {
  byId[it.json.question.id] = it.json.question;
}

// Terms are matched with an optional trailing 's', because answers naturally
// pluralise ("multiple ENIs", "read replicas") and a bare \\b would miss them.
const SERVICE_RE = new RegExp(
  '\\\\b(' + [
    'S3','EC2','RDS','VPC','IAM','SNS','SQS','EBS','EFS','ELB','ALB','NLB','KMS','DNS',
    'DAX','DMS','MGN','ECS','EKS','EMR','SES','WAF','CDN','API Gateway','CloudFront',
    'CloudTrail','CloudWatch','CloudFormation','Direct Connect','DynamoDB','Aurora',
    'Lambda','Glacier','Route 53','Shield','Macie','GuardDuty','Cognito','Kinesis',
    'Redshift','Athena','Glue','Step Functions','Systems Manager','Parameter Store',
    'Service Catalog','Storage Gateway','Transfer Acceleration','Transit Gateway',
    'Snowball','Outposts','Greengrass','SageMaker','Rekognition','FSx','Lustre',
    'ElastiCache','Redis','Memcached','Organizations','Control Tower','Config',
    'Trusted Advisor','Secrets Manager','ACM','STS','SAML','OIDC','NAT Gateway',
    'Auto Scaling','Elastic Beanstalk','AppSync','Device Farm','Ground Truth',
    'Identity Center','WorkDocs','Object Lock','ENI','VIF','awsvpc','RDS Proxy',
    'Global Accelerator','Backup','DataSync','EventBridge','Inspector',
    // forms that show up in answers but are not standalone product names
    'Elastic IP','read replica','Multi-AZ','vault lock','multipart upload',
    'Client VPN','Site-to-Site','Cached Volume','Stored Volume','File Gateway',
    'Glacier Instant Retrieval','launch constraint','task IAM role','NACL',
    'security group','hosted zone','Serverless','SAM','GSI','On-Demand',
  ].join('|') + ')s?\\\\b', 'i'
);

const META_RE = /correct answer is|this question (tests|is about)|the options (suggest|show)|option [A-E] is (wrong|incorrect)/i;
const HEDGE_RE = /\\b(it depends|may vary|typically you|you might want|possibly|perhaps)\\b/i;

const words = (s) => String(s || '').trim().split(/\\s+/).filter(Boolean).length;

// Generic English that would otherwise create false overlap between any two
// sentences, which is what made the first cut of this check unusable.
const STOP = new Set(('the that this these those with have has had been being will would ' +
  'could should from into onto each other another than then when where which while ' +
  'your their there they them and for are was were not but all any can its use used ' +
  'using also more most only over such very must need needs does done make made take ' +
  'like just even both same some what who whom how why new per via want wants look ' +
  'looks about after before during between because however therefore within without ' +
  'under above also able upon once every many much less least next last first second ' +
  'following given based order while still rather instead').split(' '));

// Crude stemmer: enough to make plural and participle forms of the same word
// compare equal, without pulling in a stemming library.
const stem = (w) => w
  .replace(/(ies)$/, 'y')
  .replace(/(sses|shes|ches|xes)$/, '')
  .replace(/(ing|ed|es|s)$/, '');

const significant = (s) =>
  new Set(
    String(s || '')
      .toLowerCase()
      .replace(/[^a-z0-9\\s]/g, ' ')
      .split(/\\s+/)
      .filter(w => w.length > 3 && !STOP.has(w))
      .map(stem)
      .filter(w => w.length > 2)
  );

const overlap = (a, b) => {
  const A = significant(a), B = significant(b);
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n;
};

function validate(tip, q) {
  const v = [];

  if (!tip || typeof tip !== 'object') return { violations: ['not an object'] };
  if (!q) return { violations: ['unknown id "' + (tip && tip.id) + '"'] };

  for (const f of ['id','trigger','answer','trap','memory_hook','confidence','needsReview']) {
    if (!(f in tip)) v.push('missing field: ' + f);
  }

  const total = words(tip.trigger) + words(tip.answer) + words(tip.trap) + words(tip.memory_hook);
  if (total > cfg.maxWords) v.push('too long: ' + total + ' words > ' + cfg.maxWords);

  if (!SERVICE_RE.test(String(tip.answer || ''))) {
    v.push('answer names no recognised AWS service');
  }

  // The trigger must come from the stem, not be invented.
  if (overlap(tip.trigger, q.prompt) < 2) {
    v.push('trigger does not echo the stem');
  }

  // The trap must point at one of this question's own wrong options.
  const distractors = (q.options || []).filter(o => !q.correctAnswers.includes(String(o.id).toUpperCase()));
  const hitsDistractor = distractors.some(o => overlap(tip.trap, o.text) >= 2);
  if (!hitsDistractor) v.push('trap does not reference a listed distractor');

  const blob = [tip.trigger, tip.answer, tip.trap].join(' ');
  if (META_RE.test(blob)) v.push('meta-language about the exercise');
  if (HEDGE_RE.test(blob)) v.push('hedging');

  // Flagging discipline: no explanation means the tip is a reasoned guess.
  if (!q.hasExplanation && !(tip.confidence === 'low' && tip.needsReview === true)) {
    v.push('question has no explanation but tip is not flagged low/needsReview');
  }

  return { violations: v };
}

function extractTip(apiResponse) {
  if (!apiResponse) return { error: 'empty response' };
  if (apiResponse.error) {
    return { error: (apiResponse.error.message || JSON.stringify(apiResponse.error)) };
  }
  if (apiResponse.stop_reason === 'refusal') {
    return { error: 'refusal: ' + JSON.stringify(apiResponse.stop_details || {}) };
  }
  const blocks = apiResponse.content || [];
  const text = (blocks.find(b => b.type === 'text') || {}).text;
  if (!text) return { error: 'no text block in response' };
  try {
    return { tip: JSON.parse(text) };
  } catch (e) {
    return { error: 'response was not valid JSON: ' + e.message };
  }
}
`.trim();

const VALIDATE = `
${VALIDATOR_FN}

return $input.all().map(item => {
  const { tip, error } = extractTip(item.json);
  const usage = item.json.usage || {};

  if (error) {
    return { json: { _valid: false, _violations: [error], _tip: null, _usage: usage } };
  }

  const q = byId[String(tip.id)];
  const { violations } = validate(tip, q);

  return {
    json: {
      _valid: violations.length === 0,
      _violations: violations,
      _tip: tip,
      _question: q || null,
      _usage: usage,
      attempt: 1,
    },
  };
});
`.trim();

const BUILD_RETRY = `
// Second and final attempt. The violations are fed back as a correction turn
// so the model is told exactly what to fix rather than simply re-rolling.
const cfg = $('Job Config').first().json;

const SCHEMA = {
  type: 'object',
  properties: {
    id:          { type: 'string' },
    trigger:     { type: 'string' },
    answer:      { type: 'string' },
    trap:        { type: 'string' },
    memory_hook: { type: 'string' },
    confidence:  { type: 'string', enum: ['high', 'medium', 'low'] },
    needsReview: { type: 'boolean' },
  },
  required: ['id', 'trigger', 'answer', 'trap', 'memory_hook', 'confidence', 'needsReview'],
  additionalProperties: false,
};

const persona = $('Prepare Chunk').first().json.persona;

return $input.all().map(item => {
  const q = item.json._question;
  const prior = item.json._tip;
  const violations = item.json._violations || [];

  const correction = [
    'Your previous tip for this question was rejected by the validator.',
    '',
    'Previous attempt:',
    JSON.stringify(prior, null, 2),
    '',
    'Validator violations — fix every one:',
    ...violations.map(v => '- ' + v),
    '',
    'Re-read sections 5 and 8 of your instructions. Return only the corrected JSON object.',
  ].join('\\n');

  const body = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    output_config: {
      effort: cfg.effort,
      format: { type: 'json_schema', schema: SCHEMA },
    },
    system: [
      { type: 'text', text: persona, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      { role: 'user', content: JSON.stringify(q, null, 2) },
      { role: 'assistant', content: JSON.stringify(prior) },
      { role: 'user', content: correction },
    ],
  };

  return { json: { ...item.json, requestBody: body, attempt: 2 } };
});
`.trim();

const VALIDATE_RETRY = `
${VALIDATOR_FN}

// Last chance. Anything still failing is kept but forced to low confidence and
// flagged for human review — a bad tip that is labelled is recoverable, a bad
// tip that is silently dropped leaves a gap nobody notices.
return $input.all().map(item => {
  const { tip, error } = extractTip(item.json);
  const priorQ = $('Build Retry Request').all()
    .map(i => i.json._question)
    .filter(Boolean);

  if (error || !tip) {
    const q = priorQ[0] || null;
    return {
      json: {
        _valid: false,
        _violations: [error || 'no tip returned on retry'],
        _tip: q ? {
          id: q.id,
          trigger: '',
          answer: '',
          trap: '',
          memory_hook: '',
          confidence: 'low',
          needsReview: true,
        } : null,
        _question: q,
        _failed: true,
        attempt: 2,
      },
    };
  }

  const q = byId[String(tip.id)];
  const { violations } = validate(tip, q);

  const finalTip = { ...tip };
  if (violations.length > 0) {
    finalTip.confidence = 'low';
    finalTip.needsReview = true;
  }

  return {
    json: {
      _valid: violations.length === 0,
      _violations: violations,
      _tip: finalTip,
      _question: q || null,
      _failed: violations.length > 0,
      attempt: 2,
    },
  };
});
`.trim();

const MERGE_TIPS = `
// Everything that came back through the loop lands here. Merge over any tips
// the file already had (so re-running a chunk is idempotent), sort by numeric
// id, and build the GitHub commit payload.
const cfg = $('Job Config').first().json;
const meta = $('Prepare Chunk').first().json.meta;

const incoming = $input.all()
  .map(i => i.json._tip)
  .filter(t => t && t.id);

const merged = new Map();
for (const t of (meta.existingTips || [])) {
  if (t && t.id) merged.set(String(t.id), t);
}
for (const t of incoming) {
  merged.set(String(t.id), {
    id: String(t.id),
    trigger: t.trigger || '',
    answer: t.answer || '',
    trap: t.trap || '',
    memory_hook: t.memory_hook || '',
    confidence: t.confidence || 'low',
    needsReview: t.needsReview === true,
  });
}

const numeric = (v) => {
  const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
  return Number.isNaN(n) ? Number.MAX_SAFE_INTEGER : n;
};

const tips = [...merged.values()].sort((a, b) => numeric(a.id) - numeric(b.id));

// Fail loudly rather than writing a file that is worse than the one already
// there. A chunk where every tip failed (an auth error, say) would otherwise
// commit an empty array over good tips and report tipCount: 0 in a log nobody
// reads - silent data loss on a re-run of an already-generated set.
if (incoming.length === 0) {
  throw new Error(
    'No tips survived validation for ' + cfg.setFile + ' [' + cfg.offset + '-' +
    (cfg.offset + cfg.size - 1) + ']. Refusing to commit. Check the ' +
    'Anthropic Generate Tip node output for the API error.'
  );
}
if (tips.length < (meta.existingTips || []).length) {
  throw new Error(
    'Refusing to commit: result has ' + tips.length + ' tips but the existing ' +
    'file had ' + meta.existingTips.length + '. This would lose tips.'
  );
}

const fileText = JSON.stringify(tips, null, 2) + '\\n';
const path = 'data/tips/' + cfg.setFile;

const commitBody = {
  message: 'Generate exam tips for ' + cfg.setFile +
           ' [' + cfg.offset + '-' + (cfg.offset + cfg.size - 1) + ']',
  content: Buffer.from(fileText, 'utf8').toString('base64'),
  branch: cfg.branch,
};
if (meta.existingSha) commitBody.sha = meta.existingSha;

return [{
  json: {
    path,
    commitBody,
    commitUrl: 'https://api.github.com/repos/' + cfg.owner + '/' + cfg.repo + '/contents/' + path,
    tipCount: tips.length,
    incomingCount: incoming.length,
    skipCommit: cfg.commit !== true,
  },
}];
`.trim();

const RUN_SUMMARY = `
// Read this in n8n's execution log — it is the run's report card.
const cfg = $('Job Config').first().json;
const merge = $('Merge Tips').first().json;

const results = [];
for (const name of ['Validate Tip', 'Validate Retry']) {
  try {
    for (const it of $(name).all()) results.push(it.json);
  } catch (e) { /* retry lane may not have run */ }
}

const firstPass = results.filter(r => r.attempt === 1 && r._valid).length;
const retried   = results.filter(r => r.attempt === 2).length;
const retryOk   = results.filter(r => r.attempt === 2 && r._valid).length;
const flagged   = results.filter(r => r._tip && r._tip.needsReview).length;

const violationTally = {};
for (const r of results) {
  for (const v of (r._violations || [])) {
    const key = v.split(':')[0];
    violationTally[key] = (violationTally[key] || 0) + 1;
  }
}

return [{
  json: {
    set: cfg.setFile,
    chunk: cfg.offset + '-' + (cfg.offset + cfg.size - 1),
    model: cfg.model,
    generated: merge.incomingCount,
    tipsInFileNow: merge.tipCount,
    passedFirstAttempt: firstPass,
    neededRetry: retried,
    retrySucceeded: retryOk,
    flaggedForReview: flagged,
    violationsByKind: violationTally,
    committed: !merge.skipCommit,
    nextChunkOffset: cfg.offset + cfg.size,
  },
}];
`.trim();

// ---------------------------------------------------------------------------
// Node + connection assembly
// ---------------------------------------------------------------------------

let nodeId = 0;
const uid = () => `node-${++nodeId}`;

const code = (name, jsCode, [x, y]) => ({
  parameters: { mode: "runOnceForAllItems", jsCode },
  id: uid(),
  name,
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [x, y],
});

const httpGet = (name, url, [x, y], { continueOnFail = false } = {}) => {
  const node = {
    parameters: {
      method: "GET",
      url,
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Accept", value: "application/vnd.github+json" },
          { name: "X-GitHub-Api-Version", value: "2022-11-28" },
          { name: "User-Agent", value: "exam-tip-agent" },
        ],
      },
      options: {},
    },
    id: uid(),
    name,
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [x, y],
    credentials: { httpHeaderAuth: { name: GITHUB_CRED } },
  };
  if (continueOnFail) {
    // data/tips/<set>.json legitimately does not exist before the first run.
    node.onError = "continueRegularOutput";
    node.alwaysOutputData = true;
  }
  return node;
};

const anthropic = (name, [x, y]) => ({
  parameters: {
    method: "POST",
    url: "https://api.anthropic.com/v1/messages",
    authentication: "genericCredentialType",
    genericAuthType: "httpHeaderAuth",
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: "anthropic-version", value: "2023-06-01" },
        { name: "content-type", value: "application/json" },
      ],
    },
    sendBody: true,
    specifyBody: "json",
    jsonBody: "={{ JSON.stringify($json.requestBody) }}",
    options: { timeout: 180000, response: { response: { neverError: true } } },
  },
  id: uid(),
  name,
  type: "n8n-nodes-base.httpRequest",
  typeVersion: 4.2,
  position: [x, y],
  credentials: { httpHeaderAuth: { name: ANTHROPIC_CRED } },
});

const ghContentsUrl = (pathExpr) =>
  `=${GH}/repos/{{ $('Job Config').first().json.owner }}/{{ $('Job Config').first().json.repo }}/contents/${pathExpr}?ref={{ $('Job Config').first().json.branch }}`;

const nodes = [
  {
    parameters: {},
    id: uid(),
    name: "When clicked",
    type: "n8n-nodes-base.manualTrigger",
    typeVersion: 1,
    position: [-220, 300],
  },

  code("Job Config", JOB_CONFIG, [0, 300]),

  httpGet("Fetch Question Set", ghContentsUrl("data/{{ $('Job Config').first().json.setFile }}"), [240, 140]),
  httpGet("Fetch Persona", ghContentsUrl("prompts/exam-tip-persona.md"), [240, 300]),
  httpGet("Fetch Existing Tips", ghContentsUrl("data/tips/{{ $('Job Config').first().json.setFile }}"), [240, 460], { continueOnFail: true }),

  code("Prepare Chunk", PREPARE_CHUNK, [480, 300]),

  {
    parameters: { batchSize: 3, options: {} },
    id: uid(),
    name: "Loop Questions",
    type: "n8n-nodes-base.splitInBatches",
    typeVersion: 3,
    position: [720, 300],
  },

  code("Build Request", BUILD_REQUEST, [960, 420]),
  anthropic("Anthropic Generate Tip", [1180, 420]),
  code("Validate Tip", VALIDATE, [1400, 420]),

  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: "valid-check",
            leftValue: "={{ $json._valid }}",
            rightValue: true,
            operator: { type: "boolean", operation: "true", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: uid(),
    name: "Tip Valid?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1620, 420],
  },

  code("Build Retry Request", BUILD_RETRY, [1840, 560]),
  anthropic("Anthropic Retry Tip", [2060, 560]),
  code("Validate Retry", VALIDATE_RETRY, [2280, 560]),

  code("Merge Tips", MERGE_TIPS, [960, 140]),

  // Gate for the dry run. Without this, Job Config's commit:false computes a
  // skipCommit flag that nothing ever reads, and the run commits anyway.
  {
    parameters: {
      conditions: {
        options: { caseSensitive: true, leftValue: "", typeValidation: "strict", version: 2 },
        conditions: [
          {
            id: "commit-gate",
            leftValue: "={{ $json.skipCommit }}",
            rightValue: false,
            operator: { type: "boolean", operation: "false", singleValue: true },
          },
        ],
        combinator: "and",
      },
      options: {},
    },
    id: uid(),
    name: "Commit Enabled?",
    type: "n8n-nodes-base.if",
    typeVersion: 2.2,
    position: [1080, 140],
  },

  {
    parameters: {
      method: "PUT",
      url: "={{ $json.commitUrl }}",
      authentication: "genericCredentialType",
      genericAuthType: "httpHeaderAuth",
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: "Accept", value: "application/vnd.github+json" },
          { name: "X-GitHub-Api-Version", value: "2022-11-28" },
          { name: "User-Agent", value: "exam-tip-agent" },
        ],
      },
      sendBody: true,
      specifyBody: "json",
      jsonBody: "={{ JSON.stringify($json.commitBody) }}",
      options: {},
    },
    id: uid(),
    name: "Commit Tips File",
    type: "n8n-nodes-base.httpRequest",
    typeVersion: 4.2,
    position: [1300, 140],
    credentials: { httpHeaderAuth: { name: GITHUB_CRED } },
  },

  code("Run Summary", RUN_SUMMARY, [1520, 140]),
];

const one = (node, index = 0) => [{ node, type: "main", index }];

const connections = {
  "When clicked": { main: [one("Job Config")] },

  // The three fetches run in sequence so each can reference Job Config and so
  // a 404 on the tips file cannot race the other two.
  "Job Config": { main: [one("Fetch Question Set")] },
  "Fetch Question Set": { main: [one("Fetch Persona")] },
  "Fetch Persona": { main: [one("Fetch Existing Tips")] },
  "Fetch Existing Tips": { main: [one("Prepare Chunk")] },

  "Prepare Chunk": { main: [one("Loop Questions")] },

  // splitInBatches: output 0 = done, output 1 = next batch.
  "Loop Questions": { main: [one("Merge Tips"), one("Build Request")] },

  "Build Request": { main: [one("Anthropic Generate Tip")] },
  "Anthropic Generate Tip": { main: [one("Validate Tip")] },
  "Validate Tip": { main: [one("Tip Valid?")] },

  // IF: output 0 = true -> straight back into the loop; output 1 = false -> retry lane.
  "Tip Valid?": { main: [one("Loop Questions"), one("Build Retry Request")] },

  "Build Retry Request": { main: [one("Anthropic Retry Tip")] },
  "Anthropic Retry Tip": { main: [one("Validate Retry")] },
  "Validate Retry": { main: [one("Loop Questions")] },

  "Merge Tips": { main: [one("Commit Enabled?")] },
  // true = commit:true -> write the file; false = dry run -> straight to summary.
  "Commit Enabled?": { main: [one("Commit Tips File"), one("Run Summary")] },
  "Commit Tips File": { main: [one("Run Summary")] },
};

const workflow = {
  name: "Exam Tip Agent",
  nodes,
  connections,
  active: false,
  settings: { executionOrder: "v1" },
  pinData: {},
  meta: {
    instanceId: "exam-tip-agent",
    description:
      "Batch-generates SAP-C02 exam pattern tips. Reads data/<set>.json and " +
      "prompts/exam-tip-persona.md from GitHub, calls Claude once per question " +
      "with a cached persona prefix, validates each tip, retries failures once, " +
      "then commits data/tips/<set>.json back. Edit the Job Config node per run.",
  },
};

mkdirSync(here, { recursive: true });
const out = join(here, "exam-tip-agent.workflow.json");
writeFileSync(out, JSON.stringify(workflow, null, 2) + "\n", "utf8");

console.log("wrote " + out);
console.log("  nodes:       " + nodes.length);
console.log("  connections: " + Object.keys(connections).length);
console.log("  credentials needed: " + ANTHROPIC_CRED + " | " + GITHUB_CRED);
