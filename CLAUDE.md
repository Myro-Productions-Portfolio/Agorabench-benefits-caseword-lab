# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Benefits Casework Lab -- a standalone repo that benchmarks and trains AI agents for institutional government benefits casework (first lane: SNAP-like). Produces artifact-based explainability, auditable replay, and a closed evaluation-to-training loop. Intended to later integrate into AgoraBench as an "agency module."

## Architecture

Single-package TypeScript project with **module-based boundaries** (not AgoraBench's flat layout). Each casework module is a self-contained directory that can later be mounted into AgoraBench as an agency module without scattering files across flat directories.

```
src/
  casework-core/    # Pure logic — no HTTP, no side effects
    stateMachine.ts # Case state transitions + validators
    scoring.ts      # Scoring interface
    oracle.ts       # Deterministic rules engine
  casework-api/     # Express HTTP API
    routes/         # REST endpoints
    services/       # Business logic services
    middleware/     # Express middleware
    websocket.ts   # WebSocket broadcast
    config.ts      # Server configuration
    index.ts       # Express app entry point
  casework-worker/  # Bull job queues
    jobs/           # Queue job handlers
  casework-ui/      # React + Vite frontend
    components/     # React components
    pages/          # Page components
    lib/            # API client, WebSocket client
    App.tsx
    main.tsx
  db/               # Database layer (shared across modules)
    schema/         # Drizzle ORM table definitions
    migrations/     # Generated SQL migrations
    connection.ts   # DB connection + exports
  shared/           # Shared types and constants (imported by all modules)
docs/
  plans/            # Implementation plans (one per feature)
  research/         # Background research docs
```

Data stores: Postgres (port 5436, persistent caseworld + run metadata), Redis (port 6381, Bull queues for parallel benchmark runs).

**Why not flat like AgoraBench:** AgoraBench's flat `routes/`, `services/`, `schema/` layout works for one domain but prevents clean module boundaries. When this repo integrates into AgoraBench, the `casework-*` directories drop in as a cohesive unit rather than mixing files into existing flat directories.

## Key Abstractions

**Policy Packs** -- Versioned artifact bundles containing `rules.json` (machine-readable rules with stable `rule_id`s), `templates/` (notice templates), `citations.json` (pinned sources with snapshot hashes), `sla.json` (processing timelines per jurisdiction). Based on 7 CFR Part 273. Full spec: `docs/research/03-policy-pack-specification.md`.

**Deterministic Oracle** -- Non-LLM rules engine: 17-step SNAP benefit calculation (income conversion, 6 deductions in order, net income test, benefit formula, proration). Pure function, no side effects. Full spec: `docs/research/05-oracle-specification.md`.

**Case State Machine** -- 12 states: RECEIVED, EXPEDITED_SCREENING, PENDING_VERIFICATION, READY_FOR_DETERMINATION, DETERMINED_APPROVED, DETERMINED_DENIED, NOTICE_SENT, APPEAL_REQUESTED, APPEAL_HEARING_SCHEDULED, APPEAL_DECIDED, IMPLEMENTED, CLOSED. Reducer pattern in `casework-core/`. Full spec: `docs/research/04-state-machine-specification.md`.

**Roles** -- Intake Clerk (create/validate/route), Caseworker (apply rules/compute/generate decisions), Supervisor/QA (approve overrides/audit/resolve appeals). Role-based access control enforced at the action layer via transition guards.

**Training Export** -- OpenAI messages JSONL format with metadata (failure tags, oracle comparison, scores). Three types: positive examples, corrective examples, preference pairs (DPO). Full spec: `docs/research/06-training-export-specification.md`.

## Non-Negotiable Design Rules

- **Artifact-first:** Every decision/action must produce or reference artifacts. No free-floating numbers.
- **Replayable audit trail:** Any score must link to exact events/artifacts that justify it.
- **Citation enforcement (hard fail):** Actions without `ruleId` citations are rejected by guards. No score penalty fallback.
- **Isolated benchmark runs:** Benchmark runner uses in-memory or isolated-schema runs; evaluation never corrupts production data.
- **Synthetic PII only.** No real personal data.
- **No outbound network for agents during benchmark runs.**

## Resolved Design Decisions

| Decision | Resolution |
|----------|-----------|
| Jurisdiction anchor | Illinois (detailed public manuals, dual BBCE thresholds, online calculator for validation) |
| Document ingestion | Typed JSON documents (no PDF upload for v0) |
| Citation enforcement | Hard fail (rejected, not just scored down) |
| Training data format | OpenAI messages JSONL (universal across OpenAI, Bedrock, Unsloth, Axolotl, MLX, HF TRL) |
| State machine pattern | Pure reducer in casework-core/ (no side effects, testable in isolation) |
| Oracle pattern | Pure function: `oracle(input, policyPack) => output` (no DB, no network) |

## Regulatory Sources

- 7 CFR Part 273 (Certification of Eligible Households) -- full reference: `docs/research/01-snap-federal-rules-reference.md`
- Illinois FY2026 SNAP parameters -- full reference: `docs/research/02-illinois-snap-parameters.md`
- AgoraBench integration plan -- full reference: `docs/research/07-agorabench-integration-specification.md`

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm dev              # Start both client (5173) and server (3002)
pnpm dev:client       # Vite dev server only (casework-ui)
pnpm dev:server       # Express via tsx watch only (casework-api)
pnpm test             # Run tests (vitest)
pnpm test:watch       # Run tests in watch mode
pnpm typecheck        # Type-check without emitting
pnpm lint             # ESLint
pnpm format           # Prettier
pnpm db:push          # Push Drizzle schema to database
pnpm db:generate      # Generate Drizzle migration
pnpm db:migrate       # Run Drizzle migrations
pnpm db:studio        # Open Drizzle Studio
pnpm docker:up        # Start Postgres (5436) + Redis (6381)
pnpm docker:down      # Stop containers
```

## Git Workflow

**Branch from main. Always.** Never commit directly to main.

**Branch naming:**
- `feature/<name>` -- New functionality
- `fix/<name>` -- Bug fixes
- `docs/<name>` -- Documentation changes
- `refactor/<name>` -- Code restructuring
- `infra/<name>` -- Infrastructure/config changes

**Commit convention:** Conventional commits with scope.
- `feat(scope): description`
- `fix(scope): description`
- `refactor(scope): description`
- `docs(scope): description`
- `infra(scope): description`

**Merge via pull request.** Feature branches merge into main through PRs with merge commits. PR title matches the conventional commit format: `feat(benchmark): Phase 6 -- Frontend Dashboard`.

**Workflow:**
1. Create feature branch: `git checkout -b feature/<name>`
2. Make commits following conventional commit format
3. Push branch: `git push -u origin feature/<name>`
4. Create PR via `gh pr create`
5. Merge PR (merge commit, not squash)

## Tech Stack (Mirrors AgoraBench)

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 20 (ESM, `"type": "module"`) |
| Package manager | pnpm >= 9 |
| Language | TypeScript 5 (strict, `moduleResolution: "bundler"`) |
| Frontend | React 18 + Vite 6 + TailwindCSS 3 |
| Backend | Express 4 (wrapped in `createServer` for WS) |
| Database | PostgreSQL 16 via `postgres` package + Drizzle ORM |
| Queue | Bull + ioredis on Redis 7 |
| WebSocket | `ws` package, path `/ws`, module-level singleton |
| Validation | Zod |
| Testing | Vitest |
| Dev runner | `tsx watch` (server), Vite HMR (client) |

**Path aliases:** `@shared/*`, `@core/*`, `@api/*`, `@worker/*`, `@ui/*`, `@db/*` -- configured in both `tsconfig.json` and `vite.config.ts`.

**API response shape:** `{ success: boolean, data?: T, error?: string }`

**WS message shape:** `{ event: string, data: unknown, timestamp: string }`

## Roadmap Reference

Full roadmap with milestones M0-M6: `docs/research/benefits-casework-lab-roadmap.md`
