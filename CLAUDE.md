# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Benefits Casework Lab -- a standalone repo that benchmarks and trains AI agents for institutional government benefits casework (first lane: SNAP-like). Produces artifact-based explainability, auditable replay, and a closed evaluation-to-training loop. Intended to later integrate into AgoraBench as an "agency module."

## Architecture (Planned)

Four services, all in this monorepo:

- **casework-core/** -- Pure logic: case state machine reducers, action schemas/validators, scoring interface, oracle interface. No HTTP, no side effects.
- **casework-api/** -- HTTP API: CRUD for cases/docs/policy packs/notices/appeals, run control, reports, JSONL training exports.
- **casework-worker/** -- Job queues (Bull/Redis): tick execution, queue routing, deadlines, benchmark runner (isolated runs), batch scoring.
- **casework-ui/** -- Transparency interface: queue view, case timeline + artifacts, policy pack viewer, run results dashboard.

Data stores: Postgres (persistent caseworld + run metadata), Redis/Bull (queues, parallel benchmark runs).

## Key Abstractions

**Policy Packs** -- Versioned artifact bundles containing `rules.json` (machine-readable rules with stable `rule_id`s), `templates/` (notice templates), `citations.json` (pinned sources with snapshot hashes), `sla.json` (processing timelines per jurisdiction). Based on 7 CFR Part 273 (SNAP federal certification).

**Deterministic Oracle** -- Non-LLM rules engine that provides expected outcomes. Used for benchmark scoring and hallucination detection. Agent decisions must cite `rule_id`s and case artifacts.

**Case State Machine** -- States: RECEIVED -> PENDING_VERIFICATION -> READY_FOR_DETERMINATION -> DETERMINED_APPROVED/DENIED -> NOTICE_SENT -> APPEAL_REQUESTED -> APPEAL_DECIDED -> IMPLEMENTED.

**Roles** -- Intake Clerk (create/validate/route), Caseworker (apply rules/compute/generate decisions), Supervisor/QA (approve overrides/audit/resolve appeals). Role-based access control enforced at the action layer.

## Non-Negotiable Design Rules

- **Artifact-first:** Every decision/action must produce or reference artifacts. No free-floating numbers.
- **Replayable audit trail:** Any score must link to exact events/artifacts that justify it.
- **Citation enforcement:** Agent decisions asserting requirements must cite `rule_id`s and relevant case artifacts.
- **Isolated benchmark runs:** Benchmark runner uses in-memory or isolated-schema runs; evaluation never corrupts production data.
- **Synthetic PII only.** No real personal data.
- **No outbound network for agents during benchmark runs.**

## Regulatory Sources

- 7 CFR Part 273 (Certification of Eligible Households)
- 7 CFR 273.10 (Determining eligibility/benefit levels)
- 7 CFR 273.15 (Fair hearings/appeals)

## Roadmap Reference

Full roadmap with milestones M0-M6: `docs/research/benefits-casework-lab-roadmap.md`
