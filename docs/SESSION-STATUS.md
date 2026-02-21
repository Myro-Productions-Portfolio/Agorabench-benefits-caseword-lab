# Session Status -- Benefits Casework Lab

**Last updated:** 2026-02-20 (end of night session)
**Branch:** `feature/m2-state-machine-missing-docs`
**Latest commit:** `0f301e2` feat(m4): add appeal metrics to shared types and UI components
**PR:** #3 (open) -- https://github.com/Myro-Productions-Portfolio/Agorabench-benefits-caseword-lab/pull/3
**Tests:** 222 passing, 0 failing

---

## Milestone Progress

| Milestone | Status | Exit Criteria |
|-----------|--------|---------------|
| M0 -- Repo bootstrap | DONE | Create a case, log an event, view in UI |
| M1 -- Artifact spine | DONE | Single case with 3+ artifacts (request, calc, notice) |
| M2 -- State machine + Missing-docs | DONE | 100 cases end-to-end; SLA + notice metrics computed |
| M3 -- Oracle + Determination worksheet | DONE | Oracle mismatch auto-creates QA tasks; mismatch rate measurable |
| M4 -- Appeals lane | DONE | Appeal reversal scenario works and is fully replayable |
| M5 -- Benchmark runner + report dashboard | NOT STARTED | Click a failure -> full replay + cited evidence |
| M6 -- Training export | NOT STARTED | User downloads a bundle and can re-run exact benchmark config |

---

## What M4 Built (10 commits, 26b7451..0f301e2)

1. **Constants** -- APPEAL_HEARING_SCHEDULED state, 6 appeal actions, hearing_officer role, appeal_reversal scenario, 3 appeal artifact types
2. **State Machine** -- Appeal transitions (NOTICE_SENT->APPEAL_REQUESTED->APPEAL_HEARING_SCHEDULED->APPEAL_DECIDED->IMPLEMENTED), guards (90-day deadline, 10-day hearing notice), role permissions
3. **Artifact Schemas** -- Zod: AppealRequestSchema, HearingRecordSchema, AppealDecisionSchema in `src/casework-core/artifacts/appeal-artifacts.ts`
4. **Scenario Generator** -- `src/casework-core/scenarios/appeal-reversal.ts`, 3 variants: favorable_reversal (~50%), unfavorable_upheld (~30%), remand_reopened (~20%), oracle-tuned financial profiles
5. **Runner** -- `runAppealReversalScenario()` in `src/casework-core/runner.ts`, denial phase + appeal phase per variant, oracle comparison at each determination
6. **Metrics** -- appealMetrics in RunSummary (casesAppealed, favorableRate, unfavorableRate, remandRate, avgTimeToDecision)
7. **DB** -- `appeal_artifacts` table in `src/db/schema/appeal-artifacts.ts`
8. **API** -- Scenario switch in POST /runs, appeal artifact storage, GET /runs/:id/appeal-artifacts
9. **UI** -- Scenario dropdown (Missing Docs / Appeal Reversal), Appeal Outcomes section in RunSummaryCard
10. **E2E Verified** -- API creates runs with artifacts, UI renders appeal outcomes, missing-docs regression passes

---

## Key Files

### Core Logic
- `src/shared/constants.ts` -- All type definitions (states, actions, roles, scenarios, artifact types)
- `src/casework-core/state-machine.ts` -- Case state machine reducer with transitions, guards, role permissions
- `src/casework-core/oracle.ts` -- SNAP eligibility oracle (17-step benefit calculation)
- `src/casework-core/runner.ts` -- Scenario runners (runMissingDocsScenario, runAppealReversalScenario)
- `src/casework-core/metrics.ts` -- RunSummary computation (SLA, outcomes, oracle, appeal metrics)
- `src/casework-core/scenarios/missing-docs.ts` -- Missing docs scenario generator (4 variants)
- `src/casework-core/scenarios/appeal-reversal.ts` -- Appeal reversal scenario generator (3 variants)
- `src/casework-core/artifacts/appeal-artifacts.ts` -- Zod schemas for appeal artifacts

### DB
- `src/db/schema/runs.ts` -- runs table
- `src/db/schema/qa-mismatches.ts` -- qa_mismatches table
- `src/db/schema/appeal-artifacts.ts` -- appeal_artifacts table
- `src/db/connection.ts` -- Drizzle ORM connection

### API
- `src/casework-api/routes/runs.ts` -- POST /runs, GET /runs, GET /runs/:id, GET /runs/:id/mismatches, GET /runs/:id/appeal-artifacts

### UI
- `src/casework-ui/components/RunScenarioForm.tsx` -- Scenario dropdown + case count
- `src/casework-ui/components/RunSummaryCard.tsx` -- Results dashboard with appeal outcomes
- `src/casework-ui/lib/api.ts` -- API client

### Tests (222 total)
- `tests/casework-core/state-machine.test.ts` -- 34 tests
- `tests/casework-core/oracle.test.ts` -- 60 tests
- `tests/casework-core/runner.test.ts` -- 21 tests (8 appeal)
- `tests/casework-core/scenarios/missing-docs.test.ts` -- 10 tests
- `tests/casework-core/scenarios/appeal-reversal.test.ts` -- 10 tests
- `tests/casework-core/metrics.test.ts` -- 11 tests
- `tests/casework-core/appeal-artifacts.test.ts` -- 14 tests
- Plus API route tests, DB schema tests, citation/policy-pack tests

---

## Design Documents

- `docs/plans/2026-02-20-m4-appeals-lane-design.md` -- M4 design (approved)
- `docs/plans/2026-02-20-m4-appeals-lane.md` -- M4 implementation plan (11 tasks, all complete)

---

## What's Next: M5 -- Benchmark Runner + Report Dashboard

Per roadmap (`docs/research/benefits-casework-lab-roadmap.md`):
- Isolated benchmark execution
- "Run results" UI with leaderboards and failure drill-down
- **Exit criteria:** Click a failure -> full replay + cited evidence

This means: the existing run infrastructure works, but M5 needs a way to drill into individual case timelines, see every event/artifact, and replay the full decision chain from a failure/mismatch back to root cause.

---

## Environment Notes

- Port 3001 is occupied by another project (`/Volumes/DevDrive-M4Pro/Projects/Molt-Goverment/`). Our server runs on port 3002.
- Vite dev server runs on port 5174.
- Docker (Postgres 5436, Redis 6381) should be running: `pnpm docker:up`
- DB schema is pushed (includes appeal_artifacts table): `pnpm db:push`
