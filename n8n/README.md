# Exam Tip Agent — n8n workflow

Batch-generates SAP-C02 exam pattern tips into `data/tips/<set>.json`. The app
never calls n8n at runtime; this runs only when tips need (re)generating.

| File | Role |
|---|---|
| `build-workflow.mjs` | **Source of truth.** Readable generator for the workflow |
| `exam-tip-agent.workflow.json` | Generated, importable into n8n. **Never hand-edit** |
| `check-workflow.mjs` | Structural checks: wiring, reachability, JS syntax of every Code node |
| `test-validator.mjs` | Calibration test: runs the real validator against the 5 gold tips offline, no API calls |

Regenerate and verify after any change:

```powershell
& "C:\Program Files\nodejs\node.exe" n8n/build-workflow.mjs
& "C:\Program Files\nodejs\node.exe" n8n/check-workflow.mjs
& "C:\Program Files\nodejs\node.exe" n8n/test-validator.mjs
```

`node` is not on PATH on this machine; Node 22 lives at the path above.

---

## 1. Create the two credentials in n8n

Both are **Header Auth** generic credentials. The names must match exactly, or
the imported nodes won't bind.

| Credential name | Header name | Header value |
|---|---|---|
| `Anthropic API (x-api-key)` | `x-api-key` | your Anthropic API key |
| `GitHub PAT (Authorization)` | `Authorization` | `Bearer <your GitHub PAT>` |

The GitHub PAT needs **`repo`** scope (it reads `data/` and `prompts/`, and
commits `data/tips/`). Mind the literal `Bearer ` prefix on the value.

Credentials live only in n8n. Nothing in this repo contains a key.

## 2. Import

Any one of these:

- **Import from URL** (easiest on Cloud) — n8n → new workflow → `⋯` menu →
  *Import from URL…* and paste:
  ```
  https://raw.githubusercontent.com/biplabid/aws-sap-c02-testmaster/fix-aws-updates/n8n/exam-tip-agent.workflow.json
  ```
  Works because this repo is public. Re-importing after a regenerate picks up
  changes, as long as they are pushed.
- **Import from File** — `⋯` menu → *Import from File…* →
  `n8n/exam-tip-agent.workflow.json`.
- **Paste** — open the raw JSON, copy all of it, and paste onto an empty n8n
  canvas. n8n turns pasted workflow JSON into nodes.

### Bind the credentials after importing — this does not happen automatically

The JSON names the credentials but cannot carry their ids, because ids are
generated per n8n instance. Depending on the n8n build, imported HTTP nodes
come in **unbound**: the node shows "Add connection" and the run fails at
`Fetch Question Set` with an auth error.

Open each of these six nodes once and pick the credential from the
**Credential to connect with** dropdown:

| Node | Credential |
|---|---|
| Fetch Question Set | `GitHub PAT (Authorization)` |
| Fetch Persona | `GitHub PAT (Authorization)` |
| Fetch Existing Tips | `GitHub PAT (Authorization)` |
| Commit Tips File | `GitHub PAT (Authorization)` |
| Anthropic Generate Tip | `Anthropic API (x-api-key)` |
| Anthropic Retry Tip | `Anthropic API (x-api-key)` |

## 3. Configure the run

Open the **Job Config** node. It is the entire control surface:

```js
setFile: 'set1.json',   // which file in data/
offset:  0,             // first question index in this chunk
size:    15,            // how many questions this run handles
commit:  true,          // false = dry run: generate and report, commit nothing
```

**Do a dry run first** (`commit: false`) to confirm the fetches and the model
call work before anything is written to the repo. The `Commit Enabled?` node
gates this: on a dry run the flow skips `Commit Tips File` and goes straight to
`Run Summary`, so you still get the full report and the generated tips in the
`Merge Tips` node's output, with nothing written to GitHub.

## 4. Run, then walk the chunks

Execute the workflow. Read the **Run Summary** node's output:

```json
{
  "set": "set1.json",
  "chunk": "0-14",
  "generated": 15,
  "passedFirstAttempt": 13,
  "neededRetry": 2,
  "retrySucceeded": 2,
  "flaggedForReview": 1,
  "violationsByKind": { "too long": 2 },
  "committed": true,
  "nextChunkOffset": 15
}
```

Set `offset` to `nextChunkOffset` and run again. Repeat until `generated` comes
back short of `size`, which means the set is done. Then move to the next
`setFile`.

Re-running a chunk is **idempotent** — tips merge by question id, so a repeat
overwrites that id range and leaves the rest of the file alone.

### Chunk budget

n8n Cloud's free tier is a 14-day trial capped at **1,000 executions**. At
`size: 15` the full corpus of 1,627 questions is ~110 executions. Do **not**
drop `size` to 1 — that would need 1,627 executions and blow the cap.

Raise `size` once you have seen how long a run takes; the reason for 15 is that
n8n Cloud's execution timeout is not publicly documented, so a timeout should
cost one chunk rather than a whole set.

---

## 5. How it works

```
Job Config
    |
    v
Fetch Question Set --> Fetch Persona --> Fetch Existing Tips
    |                                      (404 tolerated: file may not exist yet)
    v
Prepare Chunk           decode base64, slice [offset, offset+size),
    |                   normalize exactly as js/question-engine.js does
    v
Loop Questions  (batch 3) ----------------+
    | (loop)                              | (done)
    v                                     v
Build Request                        Merge Tips
    |                                     |
    v                                     v
Anthropic Generate Tip               Commit Tips File
    |                                     |
    v                                     v
Validate Tip                         Run Summary
    |
 +--+--------+
 | valid     | invalid
 v           v
back to    Build Retry Request --> Anthropic Retry Tip --> Validate Retry
loop                                                          |
                                                        back to loop
```

### Design notes worth knowing before you change anything

**The system prefix is the whole persona, byte-identical on every call.** That
is deliberate: it makes the ~4K-token prefix cacheable at $0.20/MTok instead of
$4.00/MTok. Selecting a few exemplars per question would vary the prefix and
destroy the cache — about 10x more expensive for no quality gain, since the
persona already contains all 26 exemplars.

**Tips are matched to questions by the id the model echoes back**, not by item
position, so a reordered or dropped response can never attach a tip to the wrong
question.

**The retry is a correction turn, not a re-roll.** The validator's specific
violations are fed back so the model is told what to fix.

**Nothing is silently dropped.** A tip that fails validation twice is still
written, forced to `confidence: "low"` and `needsReview: true`. A labelled bad
tip is recoverable; a missing one leaves a gap nobody notices.

**Questions with no explanation are always flagged.** 167 of the 1,627 have none
(92 in `set2.json`, 75 in `set4.json`); for those the tip is a reasoned guess, so
the validator *requires* `confidence: "low"` + `needsReview: true`. That rule is
the one gold-standard check that must never be relaxed.

## 6. Before bulk generation

Run `set1.json` chunk `0-14`, then grade the output against
`prompts/gold-standard-tips.md` §7 and record the result in its table. The pass
bar is there. Do not walk the remaining ~109 chunks until it is met.

---

## Running it locally instead

`tools/generate-tips.mjs` runs the same pipeline without n8n. It reads the Job
Config **and the validator source** out of `exam-tip-agent.workflow.json`, so
the local run and the n8n run apply identical rules by construction — change
the rules in `build-workflow.mjs`, re-run it, and both follow.

```powershell
$env:ANTHROPIC_API_KEY = "sk-ant-..."
& "C:\Program Files\nodejs\node.exe" tools/generate-tips.mjs --set set1.json --offset 0 --size 15 --dry
```

Drop `--dry` to write `data/tips/<set>.json`. It refuses to write a partial
chunk, reports the API error for every failed question, and prints measured
token usage and cost.

Use whichever fits: n8n for the visual, scheduled or shared run; the script for
fast iteration and for the bulk pass.
