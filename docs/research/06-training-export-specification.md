# Training Export Format Specification

This document defines the JSONL training data format, failure tagging system, and export bundle structure for fine-tuning AI agents on benefits casework.

---

## 1. Format Standard

**Primary format:** OpenAI messages JSONL (the universal standard supported by OpenAI, AWS Bedrock, Unsloth, Axolotl, MLX, HuggingFace TRL, and all major fine-tuning tools).

Each line in the JSONL file is a self-contained JSON object representing one training example.

---

## 2. Row Schema

```json
{
  "messages": [
    {
      "role": "system",
      "content": "You are a SNAP benefits caseworker..."
    },
    {
      "role": "user",
      "content": "Case context and task prompt..."
    },
    {
      "role": "assistant",
      "content": "Agent's action with citations..."
    }
  ],
  "metadata": {
    "caseId": "case-001",
    "runId": "run-2026-02-20-001",
    "eventId": "evt-abc123",
    "packId": "snap-illinois-fy2026-v1",
    "fromState": "READY_FOR_DETERMINATION",
    "toState": "DETERMINED_APPROVED",
    "action": "approve",
    "role": "caseworker",
    "oracleMatch": true,
    "benefitDelta": 0,
    "failureTags": [],
    "score": {
      "eligibilityCorrect": true,
      "benefitCorrect": true,
      "citationsCovered": true,
      "noticeComplete": true,
      "withinSla": true
    },
    "timestamp": "2026-02-20T14:30:00Z"
  }
}
```

---

## 3. Message Content Structure

### System Message

The system message establishes the agent's role, the policy pack context, and behavioral expectations:

```
You are a {role} processing SNAP benefits cases for {jurisdiction}.

Policy pack: {packId} (effective {effectiveDate} to {expirationDate})
Federal basis: {federalBasis}

Rules:
- Every action must cite one or more ruleIds from the policy pack
- Every determination must include a complete calculation showing all deductions
- Notices must include all required fields per the notice requirements
- Verification requests must specify exactly what is missing and the deadline

You must follow these rules without exception. Actions without citations will be rejected.
```

### User Message

The user message provides the case snapshot at the moment the agent must act:

```
Case: {caseId}
State: {currentState}
Household size: {householdSize}
Qualifying member: {yes/no}

Income:
- Earned: ${amount}/month (source: {source}, verified: {yes/no})
- Unearned: ${amount}/month (source: {source}, verified: {yes/no})

Resources: ${amount} countable

Shelter costs:
- Rent: ${amount}
- SUA tier: {tier} (${amount})

Medical expenses: ${amount} (elderly/disabled only)
Dependent care: ${amount}
Child support paid: ${amount}

Verification status:
- Identity: {verified/pending/missing}
- SSN: {verified/pending/missing}
- Income: {verified/pending/missing}
- Residency: {verified/pending/missing}

Deadlines:
- Application filed: {date}
- Processing deadline: {date} ({days} days remaining)

Task: {specific action to take, e.g., "Make an eligibility determination for this case."}
```

### Assistant Message (Ground Truth)

For successful examples, the assistant message shows the correct action:

```json
{
  "action": "approve",
  "determination": {
    "eligible": true,
    "benefitAmount": 546,
    "calculationSteps": [
      {"step": "Gross income", "value": 1500, "ruleId": "INC-CONV-001"},
      {"step": "Standard deduction", "value": 205, "ruleId": "DED-STD-001"},
      {"step": "Earned income deduction", "value": 200, "ruleId": "DED-EARN-001"}
    ]
  },
  "citations": ["ELIG-GROSS-001", "ELIG-NET-001", "BEN-CALC-001", "BEN-ALLOT-001"],
  "notice": {
    "type": "approval",
    "benefitAmount": 546,
    "certificationPeriod": "2026-03-01 to 2026-08-31",
    "fairHearingRights": true,
    "officePhone": "555-0100",
    "contactPerson": "Case Unit A"
  }
}
```

For failure examples (used in corrective training), the assistant message is the agent's actual (incorrect) action, and the metadata contains the oracle's expected output.

---

## 4. Failure Tags

Each failure is tagged with one or more specific failure types. These tags drive the training data selection and failure mode analysis.

| Tag | Category | Description |
|-----|----------|-------------|
| `ORACLE_MISMATCH_ELIGIBILITY` | Correctness | Agent's eligible/ineligible disagrees with oracle |
| `ORACLE_MISMATCH_BENEFIT` | Correctness | Benefit amount differs from oracle |
| `ORACLE_MISMATCH_DEDUCTION` | Correctness | One or more deductions differ from oracle |
| `MISSING_CITATION` | Auditability | Action lacks required ruleId citation |
| `INVALID_CITATION` | Auditability | Cited ruleId does not exist in policy pack |
| `NOTICE_MISSING_FIELD` | Notice quality | Required notice field is absent |
| `NOTICE_WRONG_CONTENT` | Notice quality | Notice field present but incorrect |
| `SLA_BREACH_STANDARD` | Timeliness | 30-day processing deadline missed |
| `SLA_BREACH_EXPEDITED` | Timeliness | 7-day expedited deadline missed |
| `SLA_BREACH_VERIFICATION` | Timeliness | Denied before minimum verification response period |
| `SLA_BREACH_APPEAL` | Timeliness | Appeal decision deadline missed |
| `OVER_COLLECTION` | Verification | Requested unnecessary verification items |
| `UNDER_COLLECTION` | Verification | Failed to request mandatory verification |
| `PREMATURE_DENIAL` | Procedure | Denied without giving required response time |
| `FAILURE_VS_REFUSAL` | Procedure | Did not distinguish between failure and refusal to cooperate |
| `ROLE_VIOLATION` | Safety | Attempted action outside role permissions |
| `UNAUTHORIZED_ACTION` | Safety | Attempted action not valid for current state |
| `MISSING_ARTIFACT` | Auditability | Action produced no artifact when one was required |

### Failure Severity

| Severity | Tags | Training Weight |
|----------|------|----------------|
| Critical | `ROLE_VIOLATION`, `UNAUTHORIZED_ACTION`, `ORACLE_MISMATCH_ELIGIBILITY` | 3x (oversampled) |
| High | `ORACLE_MISMATCH_BENEFIT`, `MISSING_CITATION`, `PREMATURE_DENIAL`, `FAILURE_VS_REFUSAL` | 2x |
| Medium | `NOTICE_MISSING_FIELD`, `OVER_COLLECTION`, `SLA_BREACH_*` | 1x |
| Low | `ORACLE_MISMATCH_DEDUCTION`, `NOTICE_WRONG_CONTENT`, `UNDER_COLLECTION` | 1x |

---

## 5. Training Data Types

### 5.1 Positive Examples (Correct Actions)

Rows where the agent's action matched the oracle and all quality checks passed. These reinforce correct behavior.

```json
{
  "messages": [...],
  "metadata": {
    "oracleMatch": true,
    "failureTags": [],
    "trainingType": "positive"
  }
}
```

### 5.2 Corrective Examples (Failures with Ground Truth)

Rows where the agent failed. The assistant message shows the **correct** action (from the oracle), and metadata records what the agent actually did wrong.

```json
{
  "messages": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "{correct action from oracle}" }
  ],
  "metadata": {
    "oracleMatch": false,
    "failureTags": ["ORACLE_MISMATCH_BENEFIT", "MISSING_CITATION"],
    "trainingType": "corrective",
    "agentActual": "{what the agent actually did}",
    "oracleExpected": "{what the oracle said should happen}"
  }
}
```

### 5.3 Preference Pairs (DPO/RLHF)

For preference-based training, export pairs of (chosen, rejected) responses:

```json
{
  "prompt": [
    { "role": "system", "content": "..." },
    { "role": "user", "content": "..." }
  ],
  "chosen": { "role": "assistant", "content": "{correct action}" },
  "rejected": { "role": "assistant", "content": "{agent's incorrect action}" },
  "metadata": {
    "trainingType": "preference",
    "failureTags": ["ORACLE_MISMATCH_BENEFIT"]
  }
}
```

---

## 6. Export Bundle

A training export is a versioned bundle containing everything needed to reproduce the training data.

```
exports/
  run-2026-02-20-001/
    training-data.jsonl         # All training rows
    training-positive.jsonl     # Positive examples only
    training-corrective.jsonl   # Corrective examples only
    training-preference.jsonl   # DPO preference pairs
    manifest.json               # Bundle metadata
    scoring-report.json         # Aggregate scores from the run
    policy-pack-snapshot/       # Copy of the exact policy pack used
      pack.json
      rules.json
      sla.json
      citations.json
      templates/
```

### manifest.json

```json
{
  "bundleId": "run-2026-02-20-001",
  "createdAt": "2026-02-20T15:00:00Z",
  "policyPackId": "snap-illinois-fy2026-v1",
  "totalCases": 100,
  "totalEvents": 1247,
  "totalRows": 1247,
  "positiveRows": 892,
  "correctiveRows": 355,
  "preferenceRows": 355,
  "failureBreakdown": {
    "ORACLE_MISMATCH_ELIGIBILITY": 12,
    "ORACLE_MISMATCH_BENEFIT": 45,
    "MISSING_CITATION": 89,
    "NOTICE_MISSING_FIELD": 34,
    "SLA_BREACH_STANDARD": 8,
    "OVER_COLLECTION": 23
  },
  "scores": {
    "eligibilityAccuracy": 0.88,
    "benefitAccuracy": 0.55,
    "citationCoverage": 0.29,
    "noticeCompleteness": 0.66,
    "slaCompliance": 0.92
  }
}
```

---

## 7. Export Filters

The API supports filtering training data for targeted fine-tuning:

| Filter | Description |
|--------|-------------|
| `failureTags` | Include only rows with specific failure tags |
| `trainingType` | `positive`, `corrective`, `preference` |
| `role` | Filter by acting role (intake_clerk, caseworker, supervisor) |
| `state` | Filter by case state at time of action |
| `minSeverity` | Include failures at or above severity threshold |
| `runId` | Specific benchmark run |
| `caseId` | Specific case |

Example: Export only corrective examples for caseworker benefit calculation errors:

```
GET /api/exports?trainingType=corrective&failureTags=ORACLE_MISMATCH_BENEFIT&role=caseworker
```

---

## 8. Compatibility Notes

### OpenAI Fine-Tuning

The `messages` array is directly compatible. Strip the `metadata` field for upload.

### AWS Bedrock

Bedrock expects the same messages format. The `metadata` field is ignored during training.

### Local Training (Unsloth, Axolotl, MLX, HF TRL)

All accept the OpenAI messages format. Some tools also support the preference pair format natively for DPO training.

### Conversion

If a tool requires a different format (e.g., Alpaca-style `instruction`/`input`/`output`), a converter script can flatten the messages array. The canonical format is always the OpenAI messages JSONL.
