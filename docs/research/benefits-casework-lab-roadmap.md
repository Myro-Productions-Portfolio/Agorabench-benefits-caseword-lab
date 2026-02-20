# Benefits Casework Lab (SNAP-like) â€” Roadmap & Steering Guide

**Date:** 2026-02-20  
**Goal:** Build a standalone, fast-iteration repo that benchmarks and trains AI agents for **institutional benefits casework** (first lane: SNAP-like), with artifact-based explainability, auditable replay, and a closed evaluationâ†’training loop.  
**Integration intent:** Later mount this as an â€œagency moduleâ€ inside AgoraBench; do not refactor AgoraBench while proving the loop. (Matches AgoraBenchâ€™s plan to keep the current site stable and build isolated benchmark runners.)

---

## 0) North-star requirements (non-negotiable)

- **Artifact-first:** Every decision/action must produce or reference artifacts (policy rules, documents, notices, calculations). No free-floating numbers. (Prevents â€œplausible but unsourcedâ€ behavior observed in forum threads.)
- **Replayable audit trail:** Any score must link to exact events/artifacts that justify it.
- **Role permissions:** Intake/caseworker/supervisor have distinct capabilities; unsafe actions are blocked by the harness.
- **Deterministic oracle:** A non-LLM rules engine provides expected outcomes for benchmark scoring and hallucination detection.
- **Isolated benchmark runs:** Benchmark runner should support in-memory or isolated-schema runs so evaluation never corrupts production data.

---

## 1) Program archetype: SNAP-like (federal baseline)

We model **workflow + rules** on SNAPâ€™s federal certification/eligibility framework (7 CFR Part 273), and implement state/jurisdiction differences via versioned â€œpolicy packs.â€

- Baseline regulatory source: **7 CFR Part 273** (Certification of Eligible Households).  
  - Determining eligibility/benefit levels: **7 CFR Â§273.10**.  
  - Fair hearings/appeals: **7 CFR Â§273.15**.

**Sources:**
- eCFR 7 CFR Part 273: https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-C/part-273
- eCFR 7 CFR 273.10: https://www.ecfr.gov/current/title-7/subtitle-B/chapter-II/subchapter-C/part-273/subpart-D/section-273.10
- Cornell 7 CFR 273.15: https://www.law.cornell.edu/cfr/text/7/273.15

---

## 2) Repo outcome (what â€œdoneâ€ looks like)

A user can:

1. Start a benchmark run (â€œMissing docsâ€, â€œEdge eligibilityâ€, â€œAppeal reversalâ€).
2. Watch agents process a queue of cases through a realistic state machine.
3. View a **case timeline** with every event, decision, and artifact.
4. See a **scorecard** (timeliness, correctness vs oracle, auditability, over-collection, safety violations).
5. Export **training JSONL** for failures and rerun after model changes to measure delta.

---

## 3) System design (high level)

### 3.1 Services

- `casework-core/` â€” pure logic
  - Case state machine reducers
  - Action schemas + validators
  - Scoring interface
  - Oracle interface
- `casework-api/` â€” HTTP API
  - CRUD: cases, docs, policy packs, notices, appeals
  - Run control: start/stop benchmark runs
  - Reports: scores, failure modes
  - Exports: JSONL training bundles
- `casework-worker/` â€” job queues
  - Tick execution, queue routing, deadlines
  - Benchmark runner (isolated runs)
  - Batch scoring and report generation
- `casework-ui/` â€” transparency interface
  - Queue view
  - Case view (timeline + artifacts)
  - Policy pack viewer
  - Run results dashboard

### 3.2 Data stores

- Postgres for persistent caseworld + run metadata
- Redis/Bull for queues/backlogs and parallel benchmark runs

---

## 4) Policy packs (the key abstraction)

A **policy pack** is a versioned artifact bundle:

- `rules.json` â€” machine-readable rules with stable `rule_id`s
- `templates/` â€” notice templates (pending verification, approval, denial, appeal rights)
- `citations.json` â€” pinned sources (URLs + snapshot hashes + human notes)
- `sla.json` â€” processing timelines (configurable per jurisdiction)

**Hard rule:** any agent decision that asserts a requirement must cite one or more `rule_id`s and relevant case artifacts.

---

## 5) Case objects and data model (minimum viable)

### 5.1 Core tables/entities

- `cases`
  - `case_id`, `program`, `jurisdiction`, `status`, `assigned_role/agent`, `created_at`, `deadlines`, `flags`
- `household_members`
  - applicant/household composition fields needed for rules (fictional identities)
- `income_items`
  - type, amount, frequency, source, verification status
- `documents`
  - `doc_type`, timestamps, storage pointer, extracted fields (optional), integrity flags
- `policy_packs`
  - `pack_id`, program, jurisdiction, version, effective date, pointers to rules/templates
- `notices`
  - notice type, rendered content, sent timestamps, cited rules/docs
- `appeals`
  - request, hearing scheduling, decision, implementation
- `events`
  - immutable audit log: actor, action, inputs, outputs, state diff, artifact links
- `scores`
  - run_id, case_id, metric, value, evidence links

### 5.2 Artifacts

Artifacts are first-class and always linkable from events:

- Verification request notice
- Determination worksheet (calculation)
- Approval/denial notice (with appeal rights)
- Appeal decision record
- Supervisor QA audit report

---

## 6) Workflow state machine (v0)

### 6.1 States

- `RECEIVED`
- `PENDING_VERIFICATION`
- `READY_FOR_DETERMINATION`
- `DETERMINED_APPROVED` / `DETERMINED_DENIED`
- `NOTICE_SENT`
- `APPEAL_REQUESTED`
- `APPEAL_DECIDED`
- `IMPLEMENTED`

### 6.2 Role actions (permissions)

- Intake Clerk
  - Create case, validate completeness, request documents, set deadlines, route to caseworker
- Caseworker
  - Apply policy rules, compute benefit, generate decision + notice, request supervisor review when uncertain
- Supervisor/QA
  - Approve overrides, audit samples, resolve escalations, decide or validate appeals

### 6.3 Deadlines

- All deadlines live in `sla.json` in the policy pack and are enforceable and scorable.

---

## 7) Benchmarks (first 3 scenarios)

Each scenario is a deterministic generator that produces N cases with controlled variability and known oracle outcomes.

1. **Missing docs**
   - Applicant omits 1â€“2 required verifications.
   - Expected: correct, minimal verification request notice + deadline; case progresses when docs arrive.
2. **Edge eligibility**
   - Borderline income/household composition.
   - Expected: correct rule selection + correct benefit computation.
3. **Appeal reversal**
   - Initial denial is appealed; hearing record indicates evidence was misread.
   - Expected: proper appeal timeline + decision artifact + implementation.

---

## 8) Scoring (stakeholder-first)

### 8.1 Primary job-performance metrics

- **Timeliness**
  - time-to-first-touch, time-to-decision, % within SLA
- **Correctness vs oracle**
  - eligibility correctness, benefit correctness, appeal overturn rate
- **Verification quality**
  - missed-required verification rate, over-collection rate (asking for unnecessary docs)
- **Notice quality**
  - required elements present (reason, rights, deadlines), clarity
- **Auditability**
  - % actions with valid `rule_id` citations + doc references

### 8.2 Secondary â€œharnessâ€ metrics

- Action parse/validity rate, latency, participation rate (keep separate from job performance)

---

## 9) Training data generation (Phase A)

### 9.1 Failure definition

A â€œfailureâ€ is any event that triggers:

- oracle mismatch (eligibility/benefit)
- missing required notice field
- missing citation
- unauthorized action attempt
- SLA breach without an allowed exception
- over-collection threshold exceeded

### 9.2 JSONL row format (suggested)

Each row must contain:

- `case_snapshot` (structured)
- `artifact_refs` (docs + policy pack version + relevant excerpts)
- `event_context` (last K events)
- `action_taken` (structured)
- `oracle_expected` (structured)
- `failure_tags`

Export bundle includes:

- JSONL
- policy pack snapshot
- scoring report
- replay pointers for top failures

---

## 10) Reinjection hook (Phase B, feature-flag)

Define the interface now (implement later):

- Input: model endpoint or adapter reference
- Run: benchmark runner
- Output: delta report vs baseline + regression detection

---

## 11) Safety & security

- No outbound network access for agents during benchmark runs.
- Policy citations must come from pinned policy pack sources.
- PII is always synthetic.
- Role-based access control in action layer.

---

## 12) Milestone roadmap (fast, realistic)

### M0 â€” Repo bootstrap (1â€“2 days)

- Skeleton services: core/api/worker/ui
- Postgres + Redis + Bull wiring
- Event log + minimal UI page that shows events

**Exit criteria:** create a case, log an event, view it in UI.

### M1 â€” Artifact spine (3â€“5 days)

- Implement artifacts + viewer
- Enforce: â€œno artifact/citation, no actionâ€

**Exit criteria:** a single case has a timeline with at least 3 artifacts (request, calc, notice).

### M2 â€” State machine + Missing-docs scenario (5â€“10 days)

- Workflow states + transitions
- Scenario generator for missing docs

**Exit criteria:** 100 cases run end-to-end; SLA + notice metrics computed.

### M3 â€” Oracle + Determination worksheet (5â€“10 days)

- Deterministic oracle for eligibility/benefit
- Calculation artifact format

**Exit criteria:** oracle mismatch auto-creates QA tasks; mismatch rate is measurable.

### M4 â€” Appeals lane (5â€“10 days)

- Appeal request + hearing + decision + implementation

**Exit criteria:** appeal reversal scenario works and is fully replayable.

### M5 â€” Benchmark runner + report dashboard (7â€“14 days)

- Isolated benchmark execution
- â€œRun resultsâ€ UI with leaderboards and failure drill-down

**Exit criteria:** click a failure â†’ full replay + cited evidence.

### M6 â€” Training export (7â€“14 days)

- JSONL export bundle for failures
- Baseline vs candidate report

**Exit criteria:** a user downloads a bundle and can re-run the exact benchmark config.

---

## 13) Integration plan back into AgoraBench (later)

When this repo is stable:

- Import as an â€œAgency moduleâ€ in AgoraBench (building/page + APIs), keeping it isolated.
- Let AgoraBenchâ€™s political layer affect policy packs and staffing levels (later step).

This aligns with AgoraBenchâ€™s planned evolution into a benchmarking platform with scenario engine, isolated runner, metrics engine, and event injection. (Do not block v0 on full integration.)

---

## 14) Open decisions (answer early)

- **Jurisdiction anchor for v0:** Indiana-first (home realism) vs Illinois-first (public manuals are very detailed).
- **Document ingestion:** start with typed JSON â€œdocumentsâ€ or support PDF upload + optional extraction.
- **How strict is citation enforcement:** hard fail vs score penalty.
