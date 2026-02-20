# AgoraBench Integration Specification

This document defines exactly how the Benefits Casework Lab module plugs into AgoraBench when the standalone repo is stable. It covers the files to create, the files to modify, and the interface contracts between them.

**Important:** This integration happens LATER (after M0-M6 are proven in the standalone repo). This spec exists so the standalone architecture stays compatible from day one.

**AgoraBench repo:** `/Volumes/DevDrive-M4Pro/Projects/Molt-Goverment` (note: directory has a typo -- `Molt-Goverment` not `Molt-Government`)

---

## 1. AgoraBench Architecture Summary

| Layer | Pattern | Key File |
|-------|---------|----------|
| Client routing | React Router in `App.tsx`, all pages inside `<Layout>` shell | `src/client/App.tsx` |
| Server routing | Express routers aggregated in `routes/index.ts`, all under `/api` | `src/server/routes/index.ts` |
| Database | Drizzle ORM, schema modules barrel-exported from `src/db/schema/index.ts` | `drizzle.config.ts` |
| Shared types | Constants, interfaces, Zod schemas in `src/shared/` | `src/shared/index.ts` |
| Auth | Clerk middleware: `requireAuth`, `requireResearcher`, `requireOwner` | `src/server/middleware/auth.ts` |
| API response | `{ success: boolean, data?: T, error?: string }` | `src/shared/types.ts` |
| WebSocket | `ws` library, `WsMessage { event, data, timestamp }` | `src/server/ws.ts` |
| Buildings | `BUILDINGS[]` array in `src/client/lib/buildings.ts` | `src/client/lib/buildings.ts` |
| Path aliases | `@shared/*`, `@db/*` | `tsconfig.json`, `vite.config.ts` |

---

## 2. Files to CREATE in AgoraBench

### 2.1 Database Schema

**File:** `src/db/schema/benefitsCasework.ts`

Defines the Drizzle schema for benefits casework tables. These tables mirror the standalone repo's schema but live in AgoraBench's shared Postgres database.

```typescript
import { pgTable, text, timestamp, jsonb, integer } from 'drizzle-orm/pg-core';

export const benefitsCases = pgTable('benefits_cases', {
  id: text('id').primaryKey(),
  program: text('program').notNull().default('SNAP'),
  jurisdiction: text('jurisdiction').notNull().default('IL'),
  status: text('status').notNull().default('RECEIVED'),
  policyPackId: text('policy_pack_id').notNull(),
  householdSize: integer('household_size').notNull(),
  assignedRole: text('assigned_role'),
  assignedAgentId: text('assigned_agent_id'),
  caseData: jsonb('case_data').notNull().default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const benefitsEvents = pgTable('benefits_events', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => benefitsCases.id),
  action: text('action').notNull(),
  actor: jsonb('actor').notNull(),
  fromState: text('from_state'),
  toState: text('to_state'),
  citations: jsonb('citations').default([]),
  artifactRefs: jsonb('artifact_refs').default([]),
  metadata: jsonb('metadata').default({}),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

### 2.2 Server Routes

**File:** `src/server/routes/benefitsCasework.ts`

Express router for benefits casework API endpoints. Delegates to service functions that share the same logic as the standalone repo's `casework-api/`.

```typescript
import { Router } from 'express';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.get('/benefits-casework/cases', requireAuth, async (req, res, next) => { /* ... */ });
router.post('/benefits-casework/cases', requireAuth, async (req, res, next) => { /* ... */ });
router.get('/benefits-casework/cases/:id', requireAuth, async (req, res, next) => { /* ... */ });
router.get('/benefits-casework/cases/:id/events', requireAuth, async (req, res, next) => { /* ... */ });
router.post('/benefits-casework/cases/:id/actions', requireAuth, async (req, res, next) => { /* ... */ });

export default router;
```

### 2.3 Client Page

**File:** `src/client/pages/BenefitsCaseworkPage.tsx`

Main page component for the benefits casework module. Contains case list, case detail view, and event timeline.

### 2.4 API Client

**File:** `src/client/lib/benefitsCaseworkApi.ts`

Client-side API functions for the benefits casework module, following AgoraBench's existing `apiRequest()` pattern.

```typescript
import { apiRequest } from './api';

export const benefitsCaseworkApi = {
  listCases: () => apiRequest('/benefits-casework/cases'),
  getCase: (id: string) => apiRequest(`/benefits-casework/cases/${id}`),
  getCaseEvents: (id: string) => apiRequest(`/benefits-casework/cases/${id}/events`),
  performAction: (id: string, action: object) =>
    apiRequest(`/benefits-casework/cases/${id}/actions`, { method: 'POST', body: action }),
};
```

### 2.5 Building Interior Image

**File:** `public/images/interiors/benefits-office.webp`

Interior background image for the benefits office building on the Capitol Map.

---

## 3. Files to MODIFY in AgoraBench

### 3.1 Schema Barrel Export

**File:** `src/db/schema/index.ts`

**Add line:**
```typescript
export { benefitsCases, benefitsEvents } from './benefitsCasework';
```

### 3.2 Route Aggregator

**File:** `src/server/routes/index.ts`

**Add lines:**
```typescript
import benefitsCaseworkRouter from './benefitsCasework';
// ...
router.use(benefitsCaseworkRouter);
```

### 3.3 Client Router

**File:** `src/client/App.tsx`

**Add inside the `<Route element={<Layout />}>` block:**
```tsx
import { BenefitsCaseworkPage } from './pages/BenefitsCaseworkPage';
// ...
<Route path="/benefits-casework" element={<BenefitsCaseworkPage />} />
```

### 3.4 Building Definition

**File:** `src/client/lib/buildings.ts`

**Add to `BUILDINGS[]` array:**
```typescript
{
  id: 'benefits-office',
  name: 'Benefits Office',
  type: 'Agency',
  description: 'Processes SNAP and benefits applications through a full casework pipeline.',
  x: /* position */,  y: /* position */,
  width: /* size */,   height: /* size */,
  color: '#2563eb',    // blue
  image: '/images/buildings/benefits-office.webp',
  seats: [/* agent seat positions */],
}
```

### 3.5 Shared Constants

**File:** `src/shared/constants.ts`

**Add:**
```typescript
export const CASE_STATUSES = [
  'RECEIVED', 'EXPEDITED_SCREENING', 'PENDING_VERIFICATION',
  'READY_FOR_DETERMINATION', 'DETERMINED_APPROVED', 'DETERMINED_DENIED',
  'NOTICE_SENT', 'APPEAL_REQUESTED', 'APPEAL_HEARING_SCHEDULED',
  'APPEAL_DECIDED', 'IMPLEMENTED', 'CLOSED'
] as const;

export const CASEWORK_ROLES = ['intake_clerk', 'caseworker', 'supervisor'] as const;

export const WS_EVENTS = {
  // ... existing events ...
  BENEFITS_CASE_UPDATE: 'benefits:case:update',
  BENEFITS_EVENT_CREATED: 'benefits:event:created',
} as const;
```

### 3.6 Shared Types

**File:** `src/shared/types.ts`

**Add:**
```typescript
export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseworkRole = (typeof CASEWORK_ROLES)[number];

export interface BenefitsCase {
  id: string;
  program: string;
  jurisdiction: string;
  status: CaseStatus;
  policyPackId: string;
  householdSize: number;
  assignedRole?: CaseworkRole;
  assignedAgentId?: string;
  createdAt: string;
}

export interface BenefitsEvent {
  id: string;
  caseId: string;
  action: string;
  actor: { role: CaseworkRole; agentId: string };
  fromState?: CaseStatus;
  toState?: CaseStatus;
  citations: string[];
  artifactRefs: string[];
  createdAt: string;
}
```

---

## 4. Integration Touchpoints Summary

| Change | File | Lines Changed | Risk |
|--------|------|---------------|------|
| New schema module | `src/db/schema/benefitsCasework.ts` | ~40 (new file) | None -- additive |
| Schema barrel | `src/db/schema/index.ts` | 1 line | None -- additive |
| New route module | `src/server/routes/benefitsCasework.ts` | ~60 (new file) | None -- additive |
| Route aggregator | `src/server/routes/index.ts` | 2 lines | Low -- import + use |
| New client page | `src/client/pages/BenefitsCaseworkPage.tsx` | ~200 (new file) | None -- additive |
| Client router | `src/client/App.tsx` | 2 lines | Low -- import + route |
| Building definition | `src/client/lib/buildings.ts` | ~12 lines | Low -- array entry |
| Shared constants | `src/shared/constants.ts` | ~15 lines | Low -- additive |
| Shared types | `src/shared/types.ts` | ~25 lines | Low -- additive |
| API client | `src/client/lib/benefitsCaseworkApi.ts` | ~15 (new file) | None -- additive |
| Interior image | `public/images/interiors/benefits-office.webp` | Binary asset | None |

**Total existing files modified:** 6 (one-line or few-line changes each)
**Total new files created:** 5
**Risk assessment:** Very low. All changes are additive. No existing functionality is modified.

---

## 5. Shared Code Strategy

The standalone repo (`Molt-Government-Benefits-Casework-Lab`) and AgoraBench share no code at build time. Instead:

1. **Core logic** lives in the standalone repo's `casework-core/` module
2. When integrating, the core logic is **copied** (not symlinked) into AgoraBench as a package or vendored directory
3. The shared types (constants, interfaces, Zod schemas) are duplicated in AgoraBench's `src/shared/` -- this is acceptable because:
   - The types are small and stable
   - The standalone repo is the source of truth
   - A simple diff script can detect drift

Future option: publish `casework-core` as an npm package and import it in both repos. This is not necessary for v0.

---

## 6. Database Strategy

**Standalone repo:** Own Postgres instance (port 5436), own database, own migrations via `drizzle-kit`.

**AgoraBench integration:** Tables are added to AgoraBench's existing Postgres (port 5435) via AgoraBench's migration system. All benefits casework tables are prefixed with `benefits_` to avoid name collisions.

The Drizzle schemas are structurally identical. The only difference is the connection configuration.

---

## 7. WebSocket Events

The standalone repo uses its own WebSocket server. When integrated into AgoraBench, benefits casework events use AgoraBench's existing `ws` broadcast system with namespaced event types:

| Event | Payload | When |
|-------|---------|------|
| `benefits:case:update` | `{ caseId, status, updatedAt }` | Case state changes |
| `benefits:event:created` | `{ eventId, caseId, action, toState }` | New event logged |

These are added to the existing `WS_EVENTS` constant and broadcast via AgoraBench's `broadcast()` function.

---

## 8. Auth Mapping

| Standalone Role | AgoraBench Auth |
|----------------|----------------|
| System (automated) | No auth needed (server-internal) |
| Viewer | `requireAuth` |
| Researcher | `requireResearcher` |
| Admin (run benchmarks, export data) | `requireOwner` |

Agent roles (intake_clerk, caseworker, supervisor) are not mapped to Clerk auth -- they are simulation roles assigned within the benefits casework system.
