# M1 Artifact Spine Design

**Date:** 2026-02-20
**Goal:** Introduce artifacts as first-class entities, enforce citations on all state transitions, and provide an inline artifact viewer in the UI.
**Exit criteria:** A single case has a timeline with at least 3 artifacts (verification request, determination worksheet, notice).

---

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Artifact type scope | Minimal 3 (verification request, determination worksheet, notice) | Just enough to hit exit criteria. Appeal/QA artifacts come in later milestones. |
| Citation enforcement scope | All state transitions | Strict from day one. Every action that changes state must cite at least one ruleId. |
| Policy pack loading | Static filesystem | Load Illinois pack from `policy-packs/snap-illinois-fy2026-v1/` on disk. No DB storage yet. |
| Artifact storage | Dedicated DB table with typed JSONB content | Artifacts are first-class per the roadmap. Separate from events, linked bidirectionally. |
| UI viewer | Timeline with expandable artifacts | Enhance existing EventLog page. Click an event to expand its artifact inline. |

---

## 1. Data Model

New `artifacts` table:

```sql
artifacts
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid()
  case_id      UUID NOT NULL FK -> cases.id
  event_id     UUID NOT NULL FK -> events.id
  type         TEXT NOT NULL  -- verification_request | determination_worksheet | notice
  content      JSONB NOT NULL -- typed per artifact type, validated by Zod
  citations    TEXT[] NOT NULL -- array of ruleIds from the policy pack
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
```

Modified `events` table -- two new columns:

- `artifact_id UUID FK -> artifacts.id` (nullable) -- links event to the artifact it produced
- `citations TEXT[]` -- every state-changing event must include at least one ruleId

Bidirectional link: artifact knows which event created it (`event_id`), event knows which artifact it produced (`artifact_id`).

---

## 2. Artifact Type Schemas

Three Zod schemas in `src/casework-core/artifacts.ts`:

### Verification Request

Produced when a case moves to PENDING_VERIFICATION.

```typescript
{
  missingItems: string[]        // e.g., ["identity", "gross_nonexempt_income"]
  deadline: string              // ISO date, at least 10 days out (SLA-VER-001)
  consequences: string          // what happens if not provided
  assistanceObligation: string  // agency must help applicant obtain docs
}
```

Required citations: VER-MAND-001 or VER-COND-001, NOT-VER-001

### Determination Worksheet

Produced when a caseworker approves or denies.

```typescript
{
  eligible: boolean
  grossIncome: number
  netIncome: number
  benefitAmount: number
  deductions: {
    standard: number
    earnedIncome: number
    dependentCare: number
    childSupport: number
    medical: number
    excessShelter: number
  }
  reason?: string               // if denied, the specific reason
}
```

Required citations: at least the rules used in calculation (ELIG-*, DED-*, BEN-*)

### Notice

Produced when a notice is sent (approval or denial).

```typescript
{
  noticeType: "approval" | "denial"
  recipientName: string
  noticeDate: string
  fields: Record<string, string>  // all required fields per NOT-APPR-001 or NOT-DENY-001
  templateId: string              // which template was used
}
```

Required citations: NOT-APPR-001 or NOT-DENY-001

---

## 3. Citation Enforcement

Every state-changing API call requires `citations: string[]` in the request body.

1. **API level:** POST /api/cases and POST /api/cases/:id/events reject requests with missing or empty citations (400 error).
2. **Validation:** Each cited ruleId is checked against the loaded policy pack's ruleId index. Unknown ruleIds are rejected (400 error).
3. **Policy pack loader:** `loadPolicyPack(packId)` in casework-core reads JSON files from disk, builds a `Set<string>` index of all valid ruleIds, slaIds, and citationIds. Loaded once at server startup, cached in memory.
4. **Valid ruleIds:** Any `ruleId`, `slaId`, or `citationId` defined in the policy pack files.
5. **CASE_CREATED:** Requires citation like all other actions. Intake clerk cites the relevant application-filing rule.

---

## 4. Policy Pack on Disk

Create the Illinois policy pack as actual JSON files:

```
policy-packs/
  snap-illinois-fy2026-v1/
    pack.json           # metadata
    rules.json          # all ruleIds from the spec (doc 03)
    sla.json            # processing timelines
    citations.json      # pinned regulatory sources
```

No templates directory yet -- notice artifact `fields` map is sufficient for M1.

The loader returns a typed `PolicyPack` object:

```typescript
interface PolicyPack {
  meta: PackMeta
  rules: Rules
  sla: Sla
  citations: Citation[]
  ruleIndex: Set<string>  // all valid ruleIds/slaIds/citationIds
}
```

Hardcoded to `snap-illinois-fy2026-v1` for M1. Multi-pack support comes later.

---

## 5. API Changes

### Modified Endpoints

- **POST /api/cases** -- requires `{ citations: string[] }`. Auto-creates CASE_CREATED event with citations. No artifact produced.
- **POST /api/cases/:id/events** -- requires `{ action, actor, citations, artifact? }`. If artifact provided, validates via Zod schema for the artifact type, stores in artifacts table, links to event. Citations validated against policy pack.

### New Endpoints

- **GET /api/cases/:id/artifacts** -- list all artifacts for a case, ordered by createdAt.
- **GET /api/artifacts/:id** -- get a single artifact by ID.
- **GET /api/policy-pack** -- returns loaded policy pack metadata + ruleId index.

### Unchanged

- GET /api/cases, GET /api/cases/:id, GET /api/cases/:id/events, GET /api/health

---

## 6. UI Changes

All changes are on the existing EventLog page. No new pages.

### Timeline Enhancement

- Events with artifacts show a badge/icon next to the action name.
- Clicking an artifact-producing event expands an inline panel below showing the artifact content.

### Artifact Display by Type

- **Verification request:** Missing items as checklist, deadline prominent, consequences and assistance text.
- **Determination worksheet:** Table of income/deduction/benefit breakdown. Eligible/denied with color coding.
- **Notice:** Structured notice fields resembling a real notice document.

### Citations Display

- Every event shows its cited ruleIds as small tags below the event.
- No ruleId linking to policy pack viewer yet (future enhancement).

### Create Case Flow

- "Create Case" button shows a small form/popover for entering citations before submitting.
- Demonstrates enforcement: can't create a case without citing a rule.

---

## 7. Testing Strategy

### Unit Tests (casework-core/)

- Zod schema validation for each artifact type (valid passes, invalid rejects with correct error)
- Policy pack loader reads files, builds ruleId index correctly
- Citation validation: valid ruleIds pass, unknown ruleIds rejected

### API Integration Tests

- POST /api/cases without citations returns 400
- POST /api/cases with valid citations returns 201 + event with citations
- POST /api/cases/:id/events with artifact payload creates both event and artifact records
- POST /api/cases/:id/events with invalid artifact content returns 400
- POST /api/cases/:id/events with unknown ruleId returns 400
- GET /api/cases/:id/artifacts returns artifacts in order
- GET /api/policy-pack returns pack metadata + ruleId list

### End-to-End Verification (Manual via UI)

1. Create a case (citing a rule)
2. Post a verification request event with artifact (citing VER-MAND-001, NOT-VER-001)
3. Post a determination event with worksheet artifact (citing ELIG/DED/BEN rules)
4. Post a notice event with notice artifact (citing NOT-APPR-001 or NOT-DENY-001)
5. Expand each artifact in the timeline, verify content renders correctly
6. Confirm: single case, 3 artifacts visible in timeline -- exit criteria met
