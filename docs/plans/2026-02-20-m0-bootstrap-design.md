# M0 Bootstrap Design

**Date:** 2026-02-20
**Milestone:** M0 -- Repo Bootstrap
**Exit criteria:** Create a case, log an event, view it in UI (real-time).

---

## Decisions

- **Stack:** TypeScript monorepo matching AgoraBench (Express, Drizzle, Bull/Redis, React+Vite, TailwindCSS, pnpm)
- **Structure:** Single package with directory-based separation (`src/client`, `src/server`, `src/db`, `src/shared`)
- **Schema scope:** Minimal -- `cases` and `events` tables only
- **UI scope:** Bare-bones event log page, no routing/layout system
- **Real-time:** WebSocket (matching AgoraBench's `ws` pattern)
- **Docker:** Local containers on M4 Pro, ports offset from AgoraBench (Postgres 5436, Redis 6381)
- **Git remote:** https://github.com/Myro-Productions-Portfolio/Agorabench-benefits-caseword-lab.git

---

## Project Structure

```
src/
  client/
    components/       # React components
    pages/            # EventLog page (M0)
    lib/              # API client, WebSocket client
    App.tsx
    main.tsx
  server/
    routes/           # cases.ts, events.ts
    services/         # caseService.ts
    websocket.ts      # WebSocket broadcast on event insert
    index.ts          # Express app setup
  db/
    schema/           # cases.ts, events.ts (Drizzle)
    index.ts          # DB connection
  shared/
    types.ts          # Shared TypeScript types
    constants.ts      # API prefix, ports, etc.
```

---

## Database Schema

### cases

| Column       | Type      | Notes                          |
|--------------|-----------|--------------------------------|
| id           | uuid      | PK, default gen_random_uuid()  |
| program      | text      | Default 'SNAP'                 |
| jurisdiction | text      | Nullable for M0                |
| status       | text      | Enum: RECEIVED, etc.           |
| created_at   | timestamp | Default now()                  |
| updated_at   | timestamp | Default now()                  |

### events

| Column     | Type      | Notes                          |
|------------|-----------|--------------------------------|
| id         | uuid      | PK, default gen_random_uuid()  |
| case_id    | uuid      | FK -> cases.id                 |
| actor      | text      | Role or system identifier      |
| action     | text      | Event type (CASE_CREATED, etc) |
| payload    | jsonb     | Arbitrary structured data      |
| created_at | timestamp | Default now()                  |

---

## API Endpoints

| Method | Path                     | Description                      |
|--------|--------------------------|----------------------------------|
| POST   | /api/cases               | Create case (auto-logs event)    |
| GET    | /api/cases               | List all cases                   |
| GET    | /api/cases/:id           | Get case with its events         |
| GET    | /api/cases/:id/events    | Get events for a case            |
| POST   | /api/cases/:id/events    | Manually log an event            |

---

## WebSocket

- Server broadcasts on event insert
- Client connects on page load, appends events to list
- Single broadcast channel (no rooms/filtering in M0)

---

## UI

Single page with:
- "Create Case" button
- Event log list: timestamp, actor, action, payload summary
- Real-time updates via WebSocket

---

## Docker Compose

- **Postgres 16-alpine:** port 5436, db `benefits_casework`, user `postgres`, password `postgres`
- **Redis 7-alpine:** port 6381
