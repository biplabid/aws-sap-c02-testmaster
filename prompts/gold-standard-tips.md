# Gold-Standard Tips — the Phase 1 grading gate

**Version:** 1.0.0
**Purpose:** five tips written by hand from real questions in `data/`. The agent must match the *substance* of these before any bulk generation runs.

**Contamination rule:** none of these five questions appear as worked examples in `prompts/exam-tip-persona.md`. The persona uses `set1.json#2`, `set20.json#3` and `set10.json#6`; this file deliberately uses five different questions. **If you add a question here, remove it from the persona, and vice versa** — otherwise the gate is measuring recall, not generalisation.

**How to use:** run the workflow over exactly these five, then score each against §7. Do not proceed to Phase 2 until the bar is met.

---

## 1. `set5.json` #4 — S3 upload performance

**Domain:** Design Solutions for Organizational Complexity · **Type:** single · **Dialect:** prose · **Answer:** `C`

Mobile video-upload app, S3 bucket in us-east-1, 10 GB files. Users in Melbourne and Sydney report slow uploads and timeouts. Distractors: `A` multipart + CloudFront as origin; `B` a bucket per Region with replication; `D` Outposts at edge locations.

**Gold tip:**

```json
{
  "id": "4",
  "trigger": "slow uploads and timeouts from users far from the bucket's Region",
  "answer": "Multipart upload plus S3 Transfer Acceleration endpoints",
  "trap": "CloudFront is the reflex pick for latency, but it accelerates downloads from an origin — it does not speed uploads to a bucket.",
  "memory_hook": "downloads = CloudFront, uploads = Transfer Acceleration",
  "confidence": "high",
  "needsReview": false
}
```

**Must get right:** the trap is specifically the CloudFront/upload-direction confusion. A tip that only says "use Transfer Acceleration" without naming the download-vs-upload trap is a **fail** — the direction is the whole exam point.

---

## 2. `set17.json` #5 — Lambda fan-out overwhelming RDS

**Domain:** Continuous Improvement for Existing Solutions · **Type:** multiple · **Dialect:** prose · **Answer:** `A` + `C`

S3 upload → SNS → several Lambdas → RDS MySQL. Metadata updates slow during peak. Distractors: `B` SNS retry policy; `D` read replicas; `E` RDS Data API.

**Gold tip:**

```json
{
  "id": "5",
  "trigger": "SNS fanning out to many Lambdas that all write to one RDS instance, slow at peak",
  "answer": "RDS Proxy to pool connections AND an SQS queue per Lambda to absorb the burst",
  "trap": "Read replicas don't help — the bottleneck is write connections, not read load. Fixing only one of the two leaves the other bottleneck in place.",
  "memory_hook": "Lambda + RDS = Proxy; burst + RDS = queue first",
  "confidence": "high",
  "needsReview": false
}
```

**Must get right:** this is a multi-answer question, so the `answer` must state **both** parts and why each is needed (per persona §5.1). Naming only RDS Proxy is a **fail**. Bonus credit for killing the read-replica distractor, since writes are the bottleneck.

---

## 3. `set2.json` #8 — DynamoDB hot-read leaderboard *(no explanation)*

**Domain:** Continuous Improvement for Existing Solutions · **Type:** single · **Dialect:** none — `explanation` is empty · **Answer:** `C`

`ProvisionedThroughputExceededException` on a read-heavy mobile game repeatedly querying the same leaderboard. Wants least code change and lowest cost. Distractors: `A` On-Demand mode; `B` ElastiCache for Redis with rewritten Lambdas; `D` a GSI.

**Gold tip:**

```json
{
  "id": "8",
  "trigger": "repeatedly querying the same DynamoDB data, read-heavy, \"least application code change\"",
  "answer": "DynamoDB Accelerator (DAX) — swap in the DAX client",
  "trap": "ElastiCache caches too, but you must write the cache-check logic yourself; On-Demand just pays more for the same repeated reads.",
  "memory_hook": "DynamoDB's own cache = DAX",
  "confidence": "low",
  "needsReview": true
}
```

**Must get right:** this question has **no explanation**, so per persona §3.2 the agent must emit `confidence: "low"` and `needsReview: true` **even though the tip itself is good**. A high-confidence answer here is a **fail regardless of tip quality** — it means the flagging logic is broken, and 167 questions would silently ship unreviewed.

---

## 4. `set13.json` #10 — two SSL certs on one instance

**Domain:** Design for New Solutions · **Type:** single · **Dialect:** prose · **Answer:** `D`

One EC2 instance, no ELB, needs two separate SSL certificates for two components. Distractors: `A` multiple subnets attached; `B` ACL + security group rules; `C` a NAT address.

**Gold tip:**

```json
{
  "id": "10",
  "trigger": "two SSL certificates on a single EC2 instance with no load balancer",
  "answer": "Multiple ENIs, each with its own Elastic IP — one certificate bound per IP",
  "trap": "Security group and NACL rules are about who may connect, not which certificate is served; and an instance cannot attach multiple subnets.",
  "memory_hook": "one cert per IP, one IP per ENI",
  "confidence": "high",
  "needsReview": false
}
```

**Must get right:** the causal chain cert → IP → ENI. A tip that says "use multiple network interfaces" without the per-IP certificate binding has copied the answer text without extracting the pattern — **fail**.

---

## 5. `set26.json` #5 — Aurora Serverless v1 cross-Region DR

**Domain:** AWS Database · **Type:** single · **Dialect:** enumerated · **Answer:** `D`

API Gateway + Lambda + Aurora Serverless v1, deployed with SAM, multi-AZ but no DR. Needs recovery in another Region at RPO 2 min / RTO 10 min. Distractors: `A` Aurora MySQL read replica + 2-min backups; `B` custom Lambda replicating every 2 min; `C` cross-Region snapshot replication.

**Gold tip:**

```json
{
  "id": "5",
  "trigger": "Aurora Serverless v1 needing cross-Region DR at a 2-minute RPO",
  "answer": "Convert to multi-Region Aurora MySQL for continuous replication, with SAM redeploying the app in the standby Region",
  "trap": "Snapshot replication and a 2-minute custom Lambda copy are both batch jobs — their RPO is the interval, so they can't beat 2 minutes. Only continuous replication can.",
  "memory_hook": "RPO in minutes = continuous replication, never snapshots",
  "confidence": "high",
  "needsReview": false
}
```

**Must get right:** the trap must reason from **RPO against replication interval** — that any periodic copy has an RPO no better than its period. A tip that merely says "snapshots are slower" misses the mechanism and is a **weak pass** at best.

---

## 6. What each tip is probing

| # | Question | Capability under test |
|---|---|---|
| 1 | `set5#4` | Extracting a *directional* trap (upload vs download) from prose |
| 2 | `set17#5` | Multi-answer combination logic + killing a plausible distractor |
| 3 | `set2#8` | **Flagging discipline** when no explanation exists |
| 4 | `set13#10` | Deriving a causal chain, not paraphrasing the answer option |
| 5 | `set26#5` | Quantitative reasoning (RPO vs replication interval) from the enumerated dialect |

---

## 7. Scoring rubric

Score each of the five tips. Criteria 1-6 are pass/fail; a tip **passes** only if all six pass.

| # | Criterion |
|---|---|
| 1 | All five hard rules from persona §5 hold (≤60 words, names a real service, trigger from the stem, trap names a listed option, no meta-language, no hedging) |
| 2 | `trigger` identifies the same giveaway as the gold tip — wording may differ, substance may not |
| 3 | `answer` names the same service or pattern, and for multi-answer questions states **both** parts |
| 4 | `trap` names the same failure mechanism as the gold tip, not merely the same distractor |
| 5 | `confidence` / `needsReview` are correct — **mandatory** `low` + `true` for #3 |
| 6 | Output is valid JSON against the §4.1 schema, nothing outside the object |

### Pass bar for proceeding to Phase 2

- **5/5 pass** → proceed.
- **4/5 pass** → proceed only if the failure is criterion 4 (trap mechanism) on question 1 or 5, and the persona has been revised once to address it.
- **≤3/5 pass**, or any failure of criterion 5 on question 3 → **do not proceed.** Revise the persona and re-run. Criterion 5 is non-negotiable: it gates 167 questions.

### Recording results

Append each attempt below, so prompt changes can be traced to score changes.

| Date | Persona version | Score | Failures | Change made |
|---|---|---|---|---|
| _(pending Phase 1)_ | 1.0.0 | — | — | — |
