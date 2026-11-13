# AI Exam Tip Agent — Architecture & Approach

**Status:** Awaiting approval. No code written yet.
**Date:** 2026-11-12
**Branch:** `fix-aws-updates`
**Decided:** batch pre-generation via n8n Cloud · tip card in the existing AI panel · separate button beside Ask AI Coach · `claude-opus-5-5` for generation, Groq retained as runtime fallback

---

## 1. The request

Add an **"Exam Tip"** button that triggers an AI Exam Tip Agent. The agent reads a question and returns a short, memorizable pattern tip in the style of `CertTip.txt`.

**Placement**

| Mode | Where the button appears | Why |
|---|---|---|
| Random Test | On every question, live | Practice mode, immediate feedback already by design |
| Timed Quiz | Review screen only, after submission | Never mid-attempt |
| Mock Exam | Review screen only, after submission | Never mid-attempt |

This matches the rule the app already documents and already enforces for Ask AI Coach (`index.html:715`): the AI is deliberately unavailable during a timed or graded attempt.

---

## 2. What already exists

The app already ships a working LLM feature. The new agent is modelled on it, not bolted beside it.

| Piece | Location | What it does |
|---|---|---|
| AI module | `js/ai-coach.js` (383 lines) | Groq OpenAI-compatible `/chat/completions` call, `openai/gpt-oss-120b` + 2 fallback models, Markdown-to-HTML renderer, slide-in side panel |
| Persona | `js/config.js:18-57` | `AI_COACH_SYSTEM_PROMPT` — long, multi-section structured output |
| Key storage | `js/ai-coach.js:4` | `ai-coach:groq-api-key` in LocalStorage, user-supplied |
| Panel markup | `index.html:1108-1131` | `#aiPanel` + backdrop; key-setup / loading / error / answer states |
| Button — Random | `index.html:258`, wired at `js/random.js:44-48` | Live, per-question |
| Button — Quiz review | `js/quiz.js:437-455` | Post-submission detailed result rows only |
| Button — Mock review | `js/mock.js:916-933` | Same, duplicated line-for-line from quiz.js |

**Normalized question shape** — `js/question-engine.js` turns every raw question into:

```
{ id, type, prompt, options[], correctAnswers[], domain, difficulty, tags[], explanation }
```

The correct answer and the explanation are already present in the client. This matters a great deal — see §4.

---

## 3. Why this is a different feature, not a prompt tweak

| Ask AI Coach (exists) | Exam Tip Agent (new) |
|---|---|
| 600-1000 words | 1-3 sentences |
| Teaches the service | Teaches the **pattern** |
| Tables, ASCII diagrams | Plain prose, arrow notation |
| "Here is what S3 Glacier is" | "If you see X, pick Y; Z is the trap" |
| The answer is the output | The answer is an **input** |
| Read once | Memorized, re-read before the exam |

All 26 samples in `CertTip.txt` follow one hidden template:

> **TRIGGER** (the phrase in the stem) → **ANSWER** (the service or pattern) ; **TRAP** (why the distractors tempt but fail)

Example — tip 21:

> "works about half the time" with two AZs → a component that exists once per AZ has failed ; if that component is a NAT instance, switch to NAT Gateways.

That template is the entire product. An agent that free-writes "tips" without enforcing the template drifts into Ask-AI-Coach-lite and the feature loses its reason to exist. Hence the output contract and the validator in §6.

---

## 4. Two measured findings that shape the design

### 4.1 The task is compression, not reasoning

Measured across all 29 set files:

| Metric | Value |
|---|---|
| Total questions | 1,627 |
| Questions **with** an explanation | 1,460 |
| Questions **without** an explanation | 167 |
| Average explanation length | 1,913 characters |
| Longest explanation | 6,759 characters |
| Average stem + options | 1,297 characters |

Those explanations are in the `Correct option: ... Incorrect options: ...` format, so they **already state why each distractor is tempting**. The agent therefore is not solving exam questions — it is distilling an existing ~1,900-character rationale into ~40 words. That is a far more reliable task, and it justifies strict output validation.

The 167 questions with no explanation require genuine reasoning. They are auto-flagged `needsReview: true` so they get read rather than trusted.

### 4.2 Prompt caching is worth roughly $22 on this job

The persona plus the 26 exemplars is a stable ~3.5K-token prefix sent on all 1,627 calls, i.e. ~5.7M tokens.

| Treatment | Rate | Cost |
|---|---|---|
| Uncached input | $4.00 / MTok | ~$23 |
| Cache reads | $0.20 / MTok | ~$1.10 |

So `cache_control: {type: "ephemeral"}` goes on the system prefix, with the per-question content placed after it.

---

## 5. Architecture decision

### 5.1 Options considered

| | Where the agent runs | Pros | Cons |
|---|---|---|---|
| **A** | In-browser, extending `ai-coach.js` | Zero infra, ships fastest | No real retrieval, prompt visible, every user needs a Groq key |
| **B** | Live n8n webhook per click | Real semantic retrieval, hidden prompt, improve tips without an app release | You run a server; Electron loses offline; pay per click forever |
| **C** | **n8n batch pre-generation (chosen)** | Instant, offline, $0 at runtime, tips are reviewable and version-controlled | Tips are static until regenerated |

### 5.2 Why C

The question sets are **static files**. There are 1,627 fixed questions in `data/`. There is no reason to pay latency and tokens at click time for an answer that will never change.

- One-time cost of ~$11 instead of a per-click cost forever.
- Tips become **reviewable, editable, version-controlled content**. A wrong tip is fixed with a text edit and a commit — impossible with a live model.
- Instant and offline, which preserves the Electron desktop build's behaviour.
- The expensive and flaky parts (retrieval, retry loops, validation) live in n8n where failures cost nothing and are visible in the execution log.
- The prompt can be improved later and the regenerated output diffed.
- **The n8n trial expiring does not break the app**, because the app never calls n8n at runtime.

The runtime code becomes a lookup plus a render. The agent work moves entirely into n8n, which is what n8n is good at.

---

## 6. The agent, logically

```
                            +-------------------------------------+
                            |   EXAM TIP AGENT                    |
   Question                 |                                     |
   |- prompt           ---> |  1. INPUT ASSEMBLY                  |
   |- options[]             |     stem + options + correct answer  |
   |- correctAnswers[] ---> |     + explanation + domain           |
   |- explanation           |     (the answer is GIVEN, not solved)|
   +- domain                |              |                      |
                            |              v                      |
   CertTip.txt        --->  |  2. STYLE RETRIEVAL                 |
   (26 exemplars)           |     pick 3-4 nearest tips by domain  |
                            |     + keyword overlap -> few-shot    |
                            |              |                      |
                            |              v                      |
                            |  3. REASON (LLM)                    |
                            |     identify the trigger phrase     |
                            |     identify why distractors tempt  |
                            |              |                      |
                            |              v                      |
                            |  4. SHAPE ENFORCEMENT               |
                            |     JSON: {trigger, answer, trap,   |
                            |            memory_hook, confidence} |
                            |     reject if >60 words -> retry    |
                            |              |                      |
                            |              v                      |
                            |  5. PERSIST by question id          |
                            +--------------|----------------------+
                                           v
                                   Tip card in #aiPanel
```

Steps 2 and 4 are what make this an *agent* rather than a single prompt: it retrieves its own style context and validates its own output shape before returning.

### 6.1 Output contract

```json
{
  "id": "14",
  "trigger": "the phrase in the stem that gives it away",
  "answer": "the service or pattern to pick",
  "trap": "why the tempting distractor fails",
  "memory_hook": "short mnemonic, optional",
  "confidence": "high | medium | low",
  "needsReview": false
}
```

### 6.2 Validator rules

A tip is rejected and regenerated if it:

1. exceeds 60 words in total;
2. does not name a real AWS service;
3. has a `trigger` that does not quote or closely paraphrase the stem;
4. has a `trap` that does not refer to one of the question's listed distractors;
5. fails JSON schema validation.

After two failed retries the tip is written with `needsReview: true` rather than discarded, so nothing is silently lost.

---

## 7. n8n Cloud free tier — verified constraints

| Constraint | Reality | Consequence |
|---|---|---|
| Free tier | No permanent free plan. **14-day trial**, Pro features, **1,000 executions**, no card. Workspace deleted at expiry, 90 days to export workflows | Generation must finish inside the window. Harmless, because the app never calls n8n at runtime |
| Filesystem | **"Read/Write Files from Disk" is not available on n8n Cloud** — self-hosted only | Cannot read `data/set*.json` or write `data/tips/` from disk. Use the GitHub node instead |
| Execution timeout | Not documented publicly for Cloud. Self-hosted caps at 3600s via `EXECUTIONS_TIMEOUT_MAX` | Unknown, so chunk conservatively rather than guess |

### 7.1 The execution-cap trap

| Chunking | Executions | Verdict |
|---|---|---|
| 1 per question | 1,627 | **Exceeds the 1,000 cap** |
| 1 per set (up to 75 questions) | 29 | Under cap, but up to 75 sequential Opus calls in one run risks the undocumented Cloud timeout |
| **~15 questions per run** | **~110** | Comfortably under cap, ~2-4 min per run, a timeout costs one chunk not a whole set |

Chosen: **~15 per run**, with chunk size as a workflow input so it can be raised once Cloud's real behaviour is observed. Re-running a chunk is idempotent — it overwrites that id range.

### 7.2 I/O via GitHub, not disk

The repo is already on GitHub at `biplabid/aws-sap-c02-testmaster`, which removes the filesystem problem entirely. n8n's GitHub node reads the question set and the persona file, and commits the tips back. No local tooling, no webhook, and the output lands in version control where it belongs.

---

## 8. The n8n workflow

```
+==============================================================================+
|  n8n Cloud (trial) - ~110 executions total, ~15 questions each               |
+==============================================================================+

 [1] Manual Trigger -- inputs: setFile = "set1.json", offset = 0, size = 15
          |
          v
 [2] GitHub  <---- get file: data/set1.json            |
     node                                              |  repo:
 [3] GitHub  <---- get file: prompts/                  |  biplabid/
     node               exam-tip-persona.md            |  aws-sap-c02-testmaster
          |                                            |  (PAT credential)
          v
 [4] Code -- parse JSON, slice [offset, offset+size),
             normalize to {id, prompt, options, correctAnswers,
                           explanation, domain, hasExplanation}
          |
          v
 [5] Loop Over Items (batch size 3, concurrent)
          |
          v
 [6] Code -- select 3-4 exemplars from CertTip.txt by domain + keyword overlap
          |
          v
 [7] HTTP Request ------------------------------> api.anthropic.com/v1/messages
     POST, model: claude-opus-5-5                   +--------------------------+
     output_config.format = JSON schema             | system: [persona,        |
     output_config.effort = "low"                   |   26 exemplars]          |
     cache_control on the system prefix  <----------|   cache_control:ephemeral|
          |                                         | user: this question      |
          v                                         +--------------------------+
 [8] Code -- VALIDATE: <=60 words · names a real AWS service ·
             trigger quotes the stem · trap names a listed distractor
          |
      +---+----+
     pass     fail --> [9] retry x2 --> still failing?
      |                                  flag needsReview
      v                                        |
 [10] Loop back <-------------------------------+
          |  (all items done)
          v
 [11] Code -- merge into tips array, sort by id, stable-stringify
          |
          v
 [12] GitHub ---- create/update file: data/tips/set1.json + commit message
      node
          |
          v
 [13] Code -- summary: generated / flagged / failed -> n8n execution log
```

### 8.1 Why HTTP Request rather than n8n's Anthropic / AI Agent node

- The **AI Agent node** is built for tool-calling loops. This job has no tools; the "agentic" parts are retrieval and validation, which n8n does natively with Code and IF nodes.
- n8n's bundled model dropdowns lag behind current model IDs.
- The HTTP node gives direct access to `claude-opus-5-5`, structured outputs (`output_config.format`), effort control, and prompt caching, with no dependency on n8n's release cycle.

---

## 9. Runtime path in the app

```
+==============================================================================+
|  RUNTIME - in the app, 0 ms, $0, works offline in Electron                   |
+==============================================================================+

  [Exam Tip]  [AI Ask AI Coach]        <- two buttons, three sites
        |
        v
  js/tip-loader.js ---> data/tips/set<N>.json   (lazy, cached per set)
        |
        +- hit  ---> js/exam-tip.js ---> tip card in #aiPanel
        |
        +- miss ---> Groq live fallback (custom/uploaded sets only,
                     same persona file, existing ai-coach key)
```

### 9.1 Tip card

```
+- EXAM TIP ---------------- X -+
|                               |
| WHEN YOU SEE                  |
|   "private hosted zone in     |
|    another account"           |
|                               |
| ANSWER                        |
|   Authorize in the zone       |
|   account, associate in       |
|   the VPC account             |
|                               |
| TRAP                          |
|   Peering alone does not      |
|   resolve private names       |
|                               |
| HOOK  "authorize -> associate"|
+-------------------------------+
```

Reuses `#aiPanel` and its open/close/escape behaviour, but renders a structured four-part card rather than Markdown prose — minimal new CSS, and visibly distinct from the Coach's long answer.

---

## 10. Cost

Generation model: **`claude-haiku-5-5`** ($0.10 / MTok input, $0.50 / MTok output, ~$0.01 / MTok cache reads).

| Component | Tokens | Cost |
|---|---|---|
| Cached system prefix (reads) | 6.2M | $0.06 |
| Per-question input (measured) | 1.38M | $0.14 |
| Output (~175 tok × 1,627) | 0.29M | $0.14 |
| **Total, one time** | | **~$0.34** |

Runtime cost after generation: **$0**.

### Why Haiku rather than Opus

The original plan specified `claude-opus-5-5` at ~$11. Haiku was chosen instead because of §4.1: for 1,460 of 1,627 questions the agent is **compressing an explanation that already names why each distractor fails**, not reasoning from scratch. That is well within a small model's range, and §11's gold-standard gate tests the assumption empirically before any bulk run. If Haiku fails the gate, the model is one line in the workflow's `Job Config` node.

### Why not Groq, given the app already uses it

Groq was evaluated for generation, since the app's existing AI Coach uses it and the runtime fallback will too. It does not work for the batch job. Free-tier limits for `openai/gpt-oss-120b` are 30 RPM / 1K RPD / **8K TPM / 200K TPD**, and the daily *token* cap binds long before the request cap:

- ~4,800 tokens per tip → **~41 questions/day** → ~40 days for the corpus
- 8K TPM → ~1.6 requests/minute, so concurrent batching 429s immediately
- Even with a compacted persona and truncated explanations (~1,450 tokens/tip) it is ~12 days of uninterrupted daily running, outliving the n8n trial, with a degraded prompt and no retry headroom

There is also a design conflict: the stable full-persona prefix exists to exploit Anthropic's cached-prefix pricing ($0.20/MTok). Groq has no such discount and bills every token against a daily quota, so the optimization that makes this cheap on Anthropic makes it unusable on Groq.

**Groq remains the runtime fallback** (§11 Phase 4) for uploaded or custom sets, where volume is a handful of requests per click rather than 1,627 in a batch. That is the right place for it.

The Message Batches API would halve the Anthropic cost, but it needs submit-and-poll logic in n8n — irrelevant at $0.34.

---

## 11. Build plan

### Phase 0 — content contract
- `prompts/exam-tip-persona.md` — persona, output JSON schema, and the 26 exemplars parsed out of `CertTip.txt`
- `prompts/gold-standard-tips.md` — 5 tips hand-written from questions already in `data/`, to grade the agent against

Committed and pushed, because n8n Cloud can only read what is on the remote.

### Phase 1 — build and tune
Build the workflow. Run on `set1.json`, offset 0, size 15. Grade the 15 tips against the gold standards. Iterate the persona until it passes. Export to `n8n/exam-tip-agent.workflow.json` and commit — this is the artifact that survives the trial.

### Phase 2 — generate
Walk the chunks, ~110 runs. Review flagged tips, fix text, commit.

### Phase 3 — app integration
- New: `js/exam-tip.js`, `js/tip-loader.js`, `css/exam-tip.css`
- `index.html` — Exam Tip button in the Random view, tip-card markup in `#aiPanel`, script and style tags
- `js/random.js` — wire the live button
- `js/view-helpers.js` — one shared `buildQuestionAiActions(row)` helper
- `js/quiz.js:437` and `js/mock.js:916` — replace both duplicated `buildAiCoachButton` copies with that helper
- `js/config.js` — tip model and fallback config

### Phase 4 — Groq fallback
For uploaded or custom sets with no pre-generated tips, fall back to the in-browser Groq path using the same persona file. Keeps the feature working for user-supplied questions.

### Phase 5 — docs
Update the in-app docs section (`index.html:714` onward) and `README.md`, matching how Ask AI Coach is documented.

---

## 12. File manifest

**Created**

| Path | Purpose |
|---|---|
| `n8n/exam-tip-agent.workflow.json` | Importable workflow — survives the trial |
| `prompts/exam-tip-persona.md` | Persona + output contract + 26 exemplars (single source of truth for n8n *and* the browser fallback) |
| `prompts/gold-standard-tips.md` | 5 hand-written tips used to grade the agent |
| `data/tips/set1.json` … `set29.json` | Generated tips |
| `js/exam-tip.js` | Tip panel controller |
| `js/tip-loader.js` | Lazy per-set tip file loader + cache |
| `css/exam-tip.css` | Tip card styles |

**Modified**

| Path | Change |
|---|---|
| `index.html` | Button, tip-card markup, script/style tags, docs |
| `js/random.js` | Wire the live Exam Tip button |
| `js/view-helpers.js` | New shared `buildQuestionAiActions(row)` |
| `js/quiz.js` | Use the shared helper (removes a duplicate) |
| `js/mock.js` | Use the shared helper (removes a duplicate) |
| `js/config.js` | Tip model + fallback config |
| `README.md` | Feature documentation |

---

## 13. Risks and mitigations

| Risk | Mitigation |
|---|---|
| n8n Cloud execution timeout is undocumented | Chunk at ~15 questions (~2-4 min/run); chunk size is a workflow input; a timeout costs one chunk |
| 1,000-execution trial cap | ~110 executions planned. Never one execution per question |
| 14-day trial expiry, workspace deleted | Workflow JSON exported to the repo in Phase 1. The app never calls n8n at runtime, so expiry is harmless |
| Agent drifts into long prose | Strict JSON schema, 60-word cap, validator, two retries, gold-standard grading gate before bulk generation |
| A tip is simply wrong | Tips are committed files. Fix with a text edit and a commit. Low-confidence and no-explanation tips are flagged for review |
| 167 questions have no explanation | Auto-flagged `needsReview: true`; reviewed by hand |
| Tips go stale when question sets change | Regeneration is per-chunk and idempotent; re-run only the affected set |

---

## 14. Open items — needed before Phase 0

1. **Anthropic API key** — for n8n's HTTP Request credential. Store it in n8n's credential store, not in this repo.
2. **GitHub PAT with `repo` scope** — for n8n's GitHub node. Same: n8n credential store only.
3. **Permission to push `prompts/` to GitHub on `fix-aws-updates`** — n8n Cloud can only read what is on the remote.

### Environment note
`node` is not on the PATH in this shell, though Node 22.17.0 is installed at `C:\Program Files\nodejs\node.exe`. The GitHub-node route needs no local runner, so this is moot unless an offline generation script is wanted later.

---

## 15. Sources

- [n8n Cloud free trial docs](https://docs.n8n.io/manage-cloud/cloud-free-trial)
- [n8n free plan 2026: Community Edition vs Cloud](https://www.activepieces.com/blog/n8n-free-plan-in-2026-community-edition-vs-cloud)
- [n8n Read/Write Files from Disk node docs](https://n8n-docs.teamlab.info/integrations/builtin/core-nodes/n8n-nodes-base.readwritefile/)
- [n8n execution timeout configuration](https://docs.n8n.io/hosting/configuration/configuration-examples/execution-timeout)
