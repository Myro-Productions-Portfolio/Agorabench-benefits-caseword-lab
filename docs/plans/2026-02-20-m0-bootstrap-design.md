# M0 Bootstrap Design

**Date:** 2026-02-20
**Milestone:** M0 -- Repo Bootstrap
**Exit criteria:** Create a case, log an event, view it in UI (real-time).

---

## Decisions

- **Stack:** TypeScript monorepo matching AgoraBench (Express, Drizzle, Bull/Redis, React+Vite, TailwindCSS, pnpm)
- **Structure:** Module-based boundaries -- `casework-core/`, `casework-api/`, `casework-worker/`, `casework-ui/` (not AgoraBench's flat layout)
- **Schema scope:** Minimal for M0 -- `cases` and `events` tables only
- **UI scope:** Bare-bones event log page, no routing/layout system
- **Real-time:** WebSocket (matching AgoraBench's `ws` pattern)
- **Docker:** Local containers on M4 Pro, ports offset from AgoraBench (Postgres 5436, Redis 6381)
- **Git remote:** https://github.com/Myro-Productions-Portfolio/Agorabench-benefits-caseword-lab.git
- **Jurisdiction:** Illinois (detailed public manuals, dual BBCE thresholds, state calculator for validation)
- **Citation enforcement:** Hard fail (actions rejected without ruleId citations)
- **Document format:** Typed JSON documents (no PDF upload for v0)

---

## Resolved Open Decisions (from Roadmap Section 14)

| Decision | Resolution | Rationale |
|----------|-----------|-----------|
| Jurisdiction anchor | **Illinois** | HTML-based manual is more parseable than Indiana's PDF-only manual; dual BBCE thresholds (165%/200% FPL) exercise more code paths; state provides online SNAP calculator for oracle validation |
| Document ingestion | **Typed JSON** | Simpler, deterministic, no OCR dependency; PDF support can be layered later |
| Citation enforcement | **Hard fail** | Actions without ruleId citations are rejected by guards; trains agents to always cite rules from the start |

---

## Project Structure

```
src/
  casework-core/      # Pure logic -- state machine, oracle, scoring
    stateMachine.ts
    oracle.ts
    scoring.ts
  casework-api/       # Express HTTP API
    routes/
    services/
    websocket.ts
    index.ts
  casework-worker/    # Bull job queues (stub in M0)
    jobs/
  casework-ui/        # React + Vite frontend
    components/
    pages/
    lib/
    App.tsx
    main.tsx
  db/                 # Drizzle ORM schema + connection
    schema/
    connection.ts
  shared/             # Types, constants, validation
    types.ts
    constants.ts
policy-packs/         # Versioned policy pack artifacts
  snap-illinois-fy2026-v1/
    pack.json
    rules.json
    sla.json
    citations.json
    templates/
```

---

## Database Schema (M0)

### cases

| Column       | Type      | Notes                          |
|--------------|-----------|--------------------------------|
| id           | text      | PK, UUID                       |
| program      | text      | Default 'SNAP'                 |
| jurisdiction | text      | Default 'IL'                   |
| status       | text      | CASE_STATUSES enum             |
| policy_pack_id | text    | FK reference to active pack    |
| household_size | integer | Required                       |
| case_data    | jsonb     | Structured case data           |
| created_at   | timestamp | Default now()                  |
| updated_at   | timestamp | Default now()                  |

### events

| Column     | Type      | Notes                          |
|------------|-----------|--------------------------------|
| id         | text      | PK, UUID                       |
| case_id    | text      | FK -> cases.id                 |
| action     | text      | Event type                     |
| actor      | jsonb     | { role, agentId }              |
| from_state | text      | State before transition        |
| to_state   | text      | State after transition         |
| citations  | jsonb     | ruleIds cited                  |
| artifact_refs | jsonb  | Artifact IDs                   |
| metadata   | jsonb     | Action-specific data           |
| created_at | timestamp | Default now()                  |

---

## API Endpoints (M0)

| Method | Path                     | Description                      |
|--------|--------------------------|----------------------------------|
| POST   | /api/cases               | Create case (auto-logs event)    |
| GET    | /api/cases               | List all cases                   |
| GET    | /api/cases/:id           | Get case with its events         |
| GET    | /api/cases/:id/events    | Get events for a case            |
| POST   | /api/cases/:id/events    | Log an event to a case           |

---

## WebSocket (M0)

- Server broadcasts on event insert
- Client connects on page load, appends events to list
- Single broadcast channel (no rooms/filtering in M0)
- Message shape: `{ event: string, data: unknown, timestamp: string }`

---

## UI (M0)

Single page with:
- "Create Case" button
- Event log list: timestamp, actor, action, payload summary
- Real-time updates via WebSocket

---

## Docker Compose

- **Postgres 16-alpine:** port 5436, db `benefits_casework`, user `postgres`, password `postgres`
- **Redis 7-alpine:** port 6381

---

## Research Documents

All research was completed before implementation. Reference these for any decision context:

| Doc | Path | Contents |
|-----|------|----------|
| Federal SNAP rules | `docs/research/01-snap-federal-rules-reference.md` | 7 CFR Part 273 -- eligibility, deductions, benefit formula, timelines, verification, notices, appeals |
| Illinois parameters | `docs/research/02-illinois-snap-parameters.md` | FY2026 values -- BBCE thresholds, income limits, allotments, deductions, SUAs |
| Policy pack spec | `docs/research/03-policy-pack-specification.md` | pack.json, rules.json, sla.json, citations.json, templates/ |
| State machine | `docs/research/04-state-machine-specification.md` | States, transitions, guards, role permissions, deadline enforcement, failure paths |
| Oracle spec | `docs/research/05-oracle-specification.md` | 17-step benefit calculation algorithm, expedited check, scoring rubric |
| Training export | `docs/research/06-training-export-specification.md` | JSONL schema, failure tags, export bundle structure |
| AgoraBench integration | `docs/research/07-agorabench-integration-specification.md` | Exact files to create/modify, interface contracts |
