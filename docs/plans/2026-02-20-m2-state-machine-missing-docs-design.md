# M2 State Machine + Missing-Docs Scenario Design

**Date:** 2026-02-20
**Goal:** Implement a pure state machine reducer with guards, role permissions, and SLA enforcement. Build a seeded scenario generator and scripted runner for the "missing docs" scenario. Run 100 cases end-to-end and compute SLA + notice metrics.
**Exit criteria:** 100 cases run end-to-end; SLA + notice metrics computed and displayed.

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Case driver | Scripted runner | Deterministic -- proves state machine/guards/SLA work before adding agent complexity |
| State scope | Missing-docs path only | 8 states, ~10 transitions. Skip expedited screening and appeals (M4). |
| Metrics timing | Inline during run | SLA checks as events are processed, metrics accumulate in run result |
| Case data depth | Minimal | Applicant name, household size, verification items. No income/deduction numbers (oracle is M3). |
| Architecture | Hybrid | Pure reducer in core + API endpoint wrapper + runner calls reducer directly |

---

## 1. State Machine Reducer

Pure function in `src/casework-core/state-machine.ts`:

```typescript
function transition(
  currentState: CaseState,
  action: CaseAction,
  context: TransitionContext
): TransitionResult
```

### States (missing-docs path)

RECEIVED -> PENDING_VERIFICATION -> READY_FOR_DETERMINATION -> DETERMINED_APPROVED / DETERMINED_DENIED -> NOTICE_SENT -> IMPLEMENTED -> CLOSED

### Actions

`request_verification`, `receive_verification`, `verification_complete`, `approve`, `deny`, `send_notice`, `implement`, `close_case`

### TransitionContext

Carries: case data, current timestamps, policy pack (for SLA lookups), actor's role.

### TransitionResult

Either `{ ok: true, newState, event }` or `{ ok: false, error, guardFailures }`.

### Guards

Each transition has an ordered list of guard functions. For M2:

- `request_verification`: must include required notice fields (NOT-VER-001)
- `verification_complete`: all mandatory items verified (VER-MAND-001)
- `approve`/`deny`: citations present, notice fields complete
- `send_notice`: notice artifact contains required fields
- SLA guards: verification response >= 10 days before denial allowed (SLA-VER-001)

### Role Permissions

- **intake_clerk:** request_verification, receive_verification
- **caseworker:** verification_complete, approve, deny, send_notice
- **supervisor:** implement, close_case
- **system:** enforce_deadline, close_abandoned

---

## 2. Scenario Generator

`src/casework-core/scenarios/missing-docs.ts` -- deterministic generator using seeded PRNG.

Each case config:
- `applicantName`: from seed list
- `householdSize`: 1-6
- `requiredVerifications`: subset of [identity, residency, income, citizenship, resources]
- `missingItems`: 1-2 items the applicant initially fails to provide
- `scenarioVariant`: one of:
  - `docs_arrive_on_time` (~40%) -- happy path, case approved
  - `docs_arrive_late` (~20%) -- docs after 30 days, benefits from date furnished
  - `docs_never_arrive` (~20%) -- 60 days pass, case closed/abandoned
  - `applicant_refuses` (~20%) -- explicit refusal, immediate denial

Given `seed` + `count`, always produces identical cases.

---

## 3. Scenario Runner

`src/casework-core/runner.ts` -- walks each case through the state machine using the reducer directly (no HTTP).

Per-variant transition sequences:

**docs_arrive_on_time:**
CASE_CREATED -> request_verification -> receive_verification -> verification_complete -> approve -> send_notice (approval) -> implement -> close_case

**docs_arrive_late:**
Same as on_time but with simulated >30 day gap. Benefits from date docs furnished.

**docs_never_arrive:**
CASE_CREATED -> request_verification -> (60 days pass) -> close_abandoned

**applicant_refuses:**
CASE_CREATED -> request_verification -> verification_refused -> deny -> send_notice (denial) -> implement -> close_case

Runner tracks: every event, every artifact, SLA checkpoints, guard failures.

Output: `RunResult` with case timelines, metrics, and errors.

---

## 4. Metrics & SLA Scoring

Computed inline during run.

### SLA Metrics

- `timeToFirstTouch`: RECEIVED to first action
- `timeToVerificationRequest`: RECEIVED to PENDING_VERIFICATION
- `timeToDecision`: RECEIVED to DETERMINED_* (30-day SLA)
- `verificationResponseTime`: time given to applicant (min 10 days per SLA-VER-001)
- `slaBreaches`: count and details

### Notice Metrics

- `noticesGenerated`: count by type
- `noticeCompleteness`: % with all required fields
- `citationCoverage`: % of events with valid citations

### Run Summary

```typescript
interface RunSummary {
  totalCases: number;
  byVariant: Record<string, number>;
  byOutcome: { approved: number; denied: number; closed: number; abandoned: number };
  slaCompliance: { onTime: number; breached: number; breachRate: number };
  averageTimeToDecision: number;
  noticeCompleteness: number;
  citationCoverage: number;
  errors: { caseId: string; error: string }[];
}
```

---

## 5. API & DB Changes

### New Endpoints

- `POST /api/cases/:id/transition` -- applies state transition via reducer. Body: `{ action, actor, role, citations, artifact?, metadata? }`. Returns event + new state or 400 with guard failures.
- `POST /api/runs` -- starts scenario run. Body: `{ scenario, count, seed? }`. Returns RunSummary.
- `GET /api/runs/:id` -- get stored run summary.

### DB Changes

- `cases` table: `/transition` endpoint updates `status` column atomically with event insert
- New `runs` table: id, scenario, seed, count, summary (JSONB), createdAt
- New `run_cases` table: runId, caseId (links cases to run)

### Unchanged

- artifacts table, events table (already have citations + artifactId from M1)

---

## 6. UI Changes

Minimal additions:

- **Run trigger:** "Run Scenario" button on main page. Form: scenario dropdown, case count (default 100), optional seed. Submits to POST /api/runs.
- **Run results:** Summary dashboard card after run: total cases, outcome breakdown, SLA compliance rate, avg time to decision, notice completeness.
- **Timeline enhancement:** Events show `fromState -> toState` on transitions. Guard failures show red badges.

---

## 7. Testing Strategy

### Unit Tests (casework-core/)

- State machine reducer: each transition (valid + invalid), guard pass/fail, role permission checks
- Scenario generator: deterministic output for seed, correct variant distribution
- Metrics: SLA breach detection, notice completeness scoring

### Integration Tests (API)

- POST /cases/:id/transition: valid returns new state, invalid returns 400, wrong role returns 403
- POST /runs: returns RunSummary with correct counts
- GET /runs/:id: returns stored run

### E2E Verification

- Run 100 missing-docs cases
- Verify: ~40 approved, ~20 late-approved, ~20 abandoned, ~20 denied
- SLA compliance rate > 0 and < 100%
- All events have citations, all notice artifacts have required fields
- Exit criteria met: 100 cases end-to-end, metrics computed and displayed
