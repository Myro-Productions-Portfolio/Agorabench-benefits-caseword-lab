# M4 -- Appeals Lane Design

**Date:** 2026-02-20
**Milestone:** M4
**Exit criteria:** Appeal reversal scenario works and is fully replayable.

---

## Summary

M4 adds the appeal path to the case state machine. The appeal scenario generates standalone denied cases (using the oracle to create cases where denial was incorrect for reversals), then runs them through the full appeal lifecycle: filing, hearing scheduling, decision, and implementation.

---

## Design Decisions

1. **All three appeal outcomes**: favorable (reversal), unfavorable (upheld), remand (reopen to READY_FOR_DETERMINATION)
2. **Standalone denial cases**: Appeal scenario generates its own cases with denial reasons (income over limit, resource test failure, etc.), not chained from missing-docs
3. **Full artifacts with Zod schemas**: appeal_request, hearing_record, appeal_decision artifact types with Zod validation and DB storage
4. **Oracle-driven reversals**: Favorable outcomes use oracle to prove original denial was wrong (oracle says eligible, case was denied)
5. **Additive extension**: New scenario file + extend state machine + new runner entry point. Parallel to existing missing-docs pattern. No refactoring of working code.

---

## State Machine Changes

### New State

`APPEAL_HEARING_SCHEDULED` -- added to `CASE_STATUSES` in `shared/constants.ts`

### New Actions

Added to `CASE_ACTIONS`:
- `appeal_filed` -- applicant files appeal
- `schedule_hearing` -- supervisor sets hearing date
- `render_decision` -- supervisor issues appeal decision
- `implement_favorable` -- apply favorable decision (benefits restored)
- `implement_unfavorable` -- finalize unfavorable decision
- `reopen_case` -- remand case back to determination

### Transition Table Additions

```
NOTICE_SENT:
  appeal_filed -> APPEAL_REQUESTED

APPEAL_REQUESTED:
  schedule_hearing -> APPEAL_HEARING_SCHEDULED

APPEAL_HEARING_SCHEDULED:
  render_decision -> APPEAL_DECIDED

APPEAL_DECIDED:
  implement_favorable -> IMPLEMENTED
  implement_unfavorable -> IMPLEMENTED
  reopen_case -> READY_FOR_DETERMINATION
```

Note: NOTICE_SENT already exists with `implement` transition. The `appeal_filed` transition is added alongside it.

### Guards

| Guard | Transition | Rule |
|-------|-----------|------|
| `guardAppealDeadline` | `appeal_filed` | Filed within 90 calendar days of notice (SLA-APP-001) |
| `guardHearingNotice` | `render_decision` | Hearing date is 10+ days after scheduling (SLA-APP-002) |
| `guardDecisionComplete` | `render_decision` | Decision cites hearing record, reasons, regulations |
| `guardFavorableTimeliness` | `implement_favorable` | Scored (not blocking) -- within 10 days of decision (SLA-APP-004) |

### Role Permissions

| Action | Allowed Roles |
|--------|--------------|
| `appeal_filed` | `system` |
| `schedule_hearing` | `supervisor` |
| `render_decision` | `supervisor` |
| `implement_favorable` | `supervisor` |
| `implement_unfavorable` | `supervisor` |
| `reopen_case` | `supervisor` |

---

## CaseData Extensions

```typescript
appealFiledAt?: Date;
appealReason?: string;
hearingScheduledAt?: Date;
hearingDate?: Date;
appealDecision?: 'favorable' | 'unfavorable' | 'remand';
originalDenialReason?: string;
noticeSentAt?: Date;
```

---

## Scenario: Appeal Reversal

File: `src/casework-core/scenarios/appeal-reversal.ts`

### Variants

1. **`favorable_reversal`** (~50%) -- Case denied, oracle says eligible. Appeal filed day 15, hearing day 35, favorable decision day 40, implemented day 45. SLA compliant.

2. **`unfavorable_upheld`** (~30%) -- Case denied, oracle agrees denial correct. Appeal filed day 20, hearing day 40, unfavorable decision day 50, implemented day 55.

3. **`remand_reopened`** (~20%) -- Case denied, oracle says eligible with different figures. Appeal filed day 10, hearing day 30, remand decision day 38, reopens to READY_FOR_DETERMINATION, re-approved day 42, notice day 44, implemented day 48, closed day 50.

### Oracle Integration

The scenario generator creates financial profiles tuned to each variant:
- **favorable_reversal**: Income/resources set so oracle says eligible; denial reason is "income over limit" but actual income is under
- **unfavorable_upheld**: Income/resources set so oracle says ineligible; denial is correct
- **remand_reopened**: Oracle says eligible but with materially different deductions; hearing finds missing evidence

---

## Artifact Schemas (Zod)

File: `src/casework-core/artifacts/appeal-artifacts.ts`

### appeal_request
- appealId: string (UUID)
- caseId: string
- filedAt: string (ISO date)
- reason: string
- citedErrors: string[]
- requestedRelief: string

### hearing_record
- hearingId: string (UUID)
- caseId: string
- scheduledAt: string (ISO date)
- hearingDate: string (ISO date)
- attendees: string[]
- evidencePresented: string[]
- findingsOfFact: string[]

### appeal_decision
- decisionId: string (UUID)
- caseId: string
- outcome: 'favorable' | 'unfavorable' | 'remand'
- reasoning: string
- citedRegulations: string[]
- orderText: string
- implementationDeadline: string (ISO date)

---

## DB Migration

New `appeal_artifacts` table:
- `id` UUID PK
- `run_id` UUID FK -> runs
- `runner_case_id` UUID
- `artifact_type` text (appeal_request | hearing_record | appeal_decision)
- `data` jsonb
- `created_at` timestamptz

---

## Runner

New entry point: `runAppealReversalScenario(cases)` in `src/casework-core/runner.ts`

Step sequence per variant covers:
1. Denial path (request_verification -> verification_complete -> deny -> send_notice)
2. Appeal path (appeal_filed -> schedule_hearing -> render_decision -> implement_*)
3. For remand: loop back through approve -> send_notice -> implement -> close_case

Oracle comparison runs at each determination point.

---

## API

- `POST /api/runs/appeal-reversal` -- run appeal scenario (count, seed)
- `GET /api/runs/:id/appeal-artifacts` -- fetch appeal artifacts for a run

---

## UI

- EventLog page: render appeal-specific events with appeal badges
- RunSummaryCard: add appealMetrics section
- Appeal artifact viewer (collapsible, similar to MismatchList)

---

## Metrics

Add `appealMetrics` to `RunSummary`:
- casesAppealed: number
- favorableRate: number
- unfavorableRate: number
- remandRate: number
- avgTimeToHearing: number (days)
- avgTimeToDecision: number (days)
- slaBreaches: string[]
