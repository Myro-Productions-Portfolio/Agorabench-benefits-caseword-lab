# M1 Artifact Spine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Introduce artifacts as first-class entities with citation enforcement on all state transitions, backed by a static Illinois policy pack.

**Architecture:** New `artifacts` DB table linked bidirectionally to events. Policy pack loaded from JSON files on disk at server startup. Zod schemas validate artifact content per type. Citation middleware rejects any state-changing action without valid ruleIds. UI enhances EventLog with expandable inline artifact viewer.

**Tech Stack:** Drizzle ORM (migration), Zod (validation), Node fs (policy pack loader), React (UI components)

**Design doc:** `docs/plans/2026-02-20-m1-artifact-spine-design.md`

---

### Task 1: Policy Pack Files on Disk

Create the Illinois SNAP FY2026 policy pack as JSON files. Content comes from `docs/research/03-policy-pack-specification.md`.

**Files:**
- Create: `policy-packs/snap-illinois-fy2026-v1/pack.json`
- Create: `policy-packs/snap-illinois-fy2026-v1/rules.json`
- Create: `policy-packs/snap-illinois-fy2026-v1/sla.json`
- Create: `policy-packs/snap-illinois-fy2026-v1/citations.json`

**Step 1: Create pack.json**

```json
{
  "packId": "snap-illinois-fy2026-v1",
  "program": "SNAP",
  "jurisdiction": "IL",
  "version": "1",
  "effectiveDate": "2025-10-01",
  "expirationDate": "2026-09-30",
  "federalBasis": "7 CFR Part 273",
  "stateManualUrl": "https://www.dhs.state.il.us/page.aspx?item=4107",
  "createdAt": "2026-02-20T00:00:00Z"
}
```

**Step 2: Create rules.json**

Copy the complete rules.json structure from `docs/research/03-policy-pack-specification.md` section 3. This includes:
- `incomeTests` (ELIG-GROSS-001, ELIG-NET-001)
- `resourceLimits` (ELIG-RES-001, ELIG-RES-002)
- `fplTable` (ELIG-FPL-001)
- `maxAllotments` (BEN-ALLOT-001)
- `deductions` (DED-STD-001, DED-EARN-001, DED-MED-001, DED-DEP-001, DED-CS-001, DED-SHLT-001, DED-HMLS-001)
- `utilityAllowances` (SUA-001)
- `benefitFormula` (BEN-CALC-001)
- `incomeConversion` (INC-CONV-001)
- `verification` (VER-MAND-001, VER-COND-001)
- `noticeRequirements` (NOT-APPR-001, NOT-DENY-001, NOT-ADV-001, NOT-VER-001)

The exact JSON is already written in the research doc -- use it verbatim.

**Step 3: Create sla.json**

Copy the complete sla.json from `docs/research/03-policy-pack-specification.md` section 4. Includes:
- `processing` (SLA-PROC-001, SLA-EXPED-001)
- `verification` (SLA-VER-001, SLA-VER-002, SLA-VER-003)
- `notices` (SLA-NOT-001)
- `appeals` (SLA-APP-001 through SLA-APP-004)
- `recertification` (SLA-RECERT-001, SLA-RECERT-002)

**Step 4: Create citations.json**

Copy from `docs/research/03-policy-pack-specification.md` section 5.

**Step 5: Commit**

```bash
git add policy-packs/
git commit -m "feat: Illinois SNAP FY2026 policy pack files"
```

---

### Task 2: PolicyPack Types + Loader

TypeScript types for the policy pack and a loader function that reads from disk and builds the ruleId index.

**Files:**
- Create: `src/casework-core/policy-pack.ts`
- Test: `tests/casework-core/policy-pack.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/casework-core/policy-pack.test.ts
import { describe, it, expect } from 'vitest';
import { loadPolicyPack } from '@core/policy-pack';
import path from 'path';

const PACK_DIR = path.resolve('policy-packs/snap-illinois-fy2026-v1');

describe('loadPolicyPack', () => {
  it('loads pack metadata', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.meta.packId).toBe('snap-illinois-fy2026-v1');
    expect(pack.meta.program).toBe('SNAP');
    expect(pack.meta.jurisdiction).toBe('IL');
  });

  it('loads rules with ruleIds', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.rules.incomeTests.grossIncomeTest.ruleId).toBe('ELIG-GROSS-001');
    expect(pack.rules.benefitFormula.ruleId).toBe('BEN-CALC-001');
  });

  it('loads SLA definitions', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.sla.processing.standard.slaId).toBe('SLA-PROC-001');
    expect(pack.sla.processing.standard.maxCalendarDays).toBe(30);
  });

  it('loads citation sources', async () => {
    const pack = await loadPolicyPack(PACK_DIR);
    expect(pack.citations.sources.length).toBeGreaterThan(0);
    expect(pack.citations.sources[0].citationId).toBe('CFR-273');
  });

  it('builds ruleIndex containing all ruleIds, slaIds, and citationIds', async () => {
    const pack = await loadPolicyPack(PACK_DIR);

    // ruleIds from rules.json
    expect(pack.ruleIndex.has('ELIG-GROSS-001')).toBe(true);
    expect(pack.ruleIndex.has('BEN-CALC-001')).toBe(true);
    expect(pack.ruleIndex.has('VER-MAND-001')).toBe(true);
    expect(pack.ruleIndex.has('NOT-APPR-001')).toBe(true);

    // slaIds from sla.json
    expect(pack.ruleIndex.has('SLA-PROC-001')).toBe(true);
    expect(pack.ruleIndex.has('SLA-APP-001')).toBe(true);

    // citationIds from citations.json
    expect(pack.ruleIndex.has('CFR-273')).toBe(true);

    // unknown IDs should not be present
    expect(pack.ruleIndex.has('FAKE-001')).toBe(false);
  });

  it('throws on missing directory', async () => {
    await expect(loadPolicyPack('/nonexistent/path')).rejects.toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/policy-pack.test.ts`
Expected: FAIL -- module `@core/policy-pack` not found

**Step 3: Write the implementation**

```typescript
// src/casework-core/policy-pack.ts
import { readFile } from 'fs/promises';
import path from 'path';

// --- Types ---

export interface PackMeta {
  packId: string;
  program: string;
  jurisdiction: string;
  version: string;
  effectiveDate: string;
  expirationDate: string;
  federalBasis: string;
  stateManualUrl: string;
  createdAt: string;
}

export interface PolicyPack {
  meta: PackMeta;
  rules: Record<string, unknown>;  // deeply nested, typed loosely for M1
  sla: Record<string, unknown>;
  citations: { sources: Array<{ citationId: string; title: string; url: string; accessDate: string; type: string }> };
  ruleIndex: Set<string>;
}

// --- Loader ---

async function readJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Recursively extract all values for keys named "ruleId" or "slaId" or "citationId"
 * from a nested object.
 */
function extractIds(obj: unknown, keys: string[]): string[] {
  const ids: string[] = [];
  if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if (keys.includes(k) && typeof v === 'string') {
        ids.push(v);
      }
      if (v && typeof v === 'object') {
        ids.push(...extractIds(v, keys));
      }
    }
  }
  return ids;
}

export async function loadPolicyPack(packDir: string): Promise<PolicyPack> {
  const [meta, rules, sla, citations] = await Promise.all([
    readJson(path.join(packDir, 'pack.json')) as Promise<PackMeta>,
    readJson(path.join(packDir, 'rules.json')) as Promise<Record<string, unknown>>,
    readJson(path.join(packDir, 'sla.json')) as Promise<Record<string, unknown>>,
    readJson(path.join(packDir, 'citations.json')) as Promise<PolicyPack['citations']>,
  ]);

  const ruleIds = extractIds(rules, ['ruleId']);
  const slaIds = extractIds(sla, ['slaId']);
  const citationIds = extractIds(citations, ['citationId']);

  const ruleIndex = new Set([...ruleIds, ...slaIds, ...citationIds]);

  return { meta, rules, sla, citations, ruleIndex };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/casework-core/policy-pack.test.ts`
Expected: 6 tests PASS

**Step 5: Commit**

```bash
git add src/casework-core/policy-pack.ts tests/casework-core/policy-pack.test.ts
git commit -m "feat(core): policy pack types and filesystem loader"
```

---

### Task 3: Artifact Zod Schemas

Zod schemas for the 3 artifact types: verification_request, determination_worksheet, notice.

**Files:**
- Create: `src/casework-core/artifacts.ts`
- Test: `tests/casework-core/artifacts.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/casework-core/artifacts.test.ts
import { describe, it, expect } from 'vitest';
import {
  verificationRequestSchema,
  determinationWorksheetSchema,
  noticeSchema,
  validateArtifact,
  ARTIFACT_TYPES,
} from '@core/artifacts';

describe('verificationRequestSchema', () => {
  it('accepts valid verification request', () => {
    const result = verificationRequestSchema.safeParse({
      missingItems: ['identity', 'gross_nonexempt_income'],
      deadline: '2026-03-05',
      consequences: 'Application may be denied if documents are not received by the deadline.',
      assistanceObligation: 'The agency will assist you in obtaining required documents.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects verification request without missingItems', () => {
    const result = verificationRequestSchema.safeParse({
      deadline: '2026-03-05',
      consequences: 'text',
      assistanceObligation: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty missingItems array', () => {
    const result = verificationRequestSchema.safeParse({
      missingItems: [],
      deadline: '2026-03-05',
      consequences: 'text',
      assistanceObligation: 'text',
    });
    expect(result.success).toBe(false);
  });
});

describe('determinationWorksheetSchema', () => {
  it('accepts valid approved worksheet', () => {
    const result = determinationWorksheetSchema.safeParse({
      eligible: true,
      grossIncome: 2500,
      netIncome: 1800,
      benefitAmount: 450,
      deductions: {
        standard: 205,
        earnedIncome: 300,
        dependentCare: 0,
        childSupport: 0,
        medical: 0,
        excessShelter: 195,
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts valid denied worksheet with reason', () => {
    const result = determinationWorksheetSchema.safeParse({
      eligible: false,
      grossIncome: 5000,
      netIncome: 4500,
      benefitAmount: 0,
      deductions: {
        standard: 205,
        earnedIncome: 0,
        dependentCare: 0,
        childSupport: 0,
        medical: 0,
        excessShelter: 0,
      },
      reason: 'Gross income exceeds 165% FPL for household size 3',
    });
    expect(result.success).toBe(true);
  });

  it('rejects worksheet missing deductions', () => {
    const result = determinationWorksheetSchema.safeParse({
      eligible: true,
      grossIncome: 2500,
      netIncome: 1800,
      benefitAmount: 450,
    });
    expect(result.success).toBe(false);
  });
});

describe('noticeSchema', () => {
  it('accepts valid approval notice', () => {
    const result = noticeSchema.safeParse({
      noticeType: 'approval',
      recipientName: 'Jane Doe',
      noticeDate: '2026-02-25',
      fields: {
        benefit_amount: '$450',
        certification_period: '2026-03 to 2026-08',
        fair_hearing_rights: 'You have the right to request a fair hearing within 90 days.',
      },
      templateId: 'approval-notice',
    });
    expect(result.success).toBe(true);
  });

  it('rejects notice with invalid noticeType', () => {
    const result = noticeSchema.safeParse({
      noticeType: 'warning',
      recipientName: 'Jane Doe',
      noticeDate: '2026-02-25',
      fields: {},
      templateId: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('validateArtifact', () => {
  it('validates correct type and content', () => {
    const result = validateArtifact('verification_request', {
      missingItems: ['identity'],
      deadline: '2026-03-05',
      consequences: 'Denial',
      assistanceObligation: 'Agency will help',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown artifact type', () => {
    const result = validateArtifact('unknown_type', { foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('rejects content that does not match schema for type', () => {
    const result = validateArtifact('notice', { missingItems: ['identity'] });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/artifacts.test.ts`
Expected: FAIL -- module `@core/artifacts` not found

**Step 3: Write the implementation**

```typescript
// src/casework-core/artifacts.ts
import { z } from 'zod';

// --- Artifact Types ---

export const ARTIFACT_TYPES = [
  'verification_request',
  'determination_worksheet',
  'notice',
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

// --- Schemas ---

export const verificationRequestSchema = z.object({
  missingItems: z.array(z.string()).min(1),
  deadline: z.string(),
  consequences: z.string(),
  assistanceObligation: z.string(),
});

export const determinationWorksheetSchema = z.object({
  eligible: z.boolean(),
  grossIncome: z.number(),
  netIncome: z.number(),
  benefitAmount: z.number(),
  deductions: z.object({
    standard: z.number(),
    earnedIncome: z.number(),
    dependentCare: z.number(),
    childSupport: z.number(),
    medical: z.number(),
    excessShelter: z.number(),
  }),
  reason: z.string().optional(),
});

export const noticeSchema = z.object({
  noticeType: z.enum(['approval', 'denial']),
  recipientName: z.string(),
  noticeDate: z.string(),
  fields: z.record(z.string(), z.string()),
  templateId: z.string(),
});

// --- Type inference ---

export type VerificationRequest = z.infer<typeof verificationRequestSchema>;
export type DeterminationWorksheet = z.infer<typeof determinationWorksheetSchema>;
export type Notice = z.infer<typeof noticeSchema>;

// --- Validator ---

const schemaMap: Record<string, z.ZodSchema> = {
  verification_request: verificationRequestSchema,
  determination_worksheet: determinationWorksheetSchema,
  notice: noticeSchema,
};

export function validateArtifact(
  type: string,
  content: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = schemaMap[type];
  if (!schema) {
    return { success: false, error: `Unknown artifact type: ${type}` };
  }
  const result = schema.safeParse(content);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/casework-core/artifacts.test.ts`
Expected: 9 tests PASS

**Step 5: Commit**

```bash
git add src/casework-core/artifacts.ts tests/casework-core/artifacts.test.ts
git commit -m "feat(core): Zod schemas for verification request, worksheet, and notice artifacts"
```

---

### Task 4: Citation Validation

A pure function that checks citations against the policy pack ruleIndex.

**Files:**
- Create: `src/casework-core/citations.ts`
- Test: `tests/casework-core/citations.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/casework-core/citations.test.ts
import { describe, it, expect } from 'vitest';
import { validateCitations } from '@core/citations';

const mockRuleIndex = new Set(['ELIG-GROSS-001', 'BEN-CALC-001', 'SLA-PROC-001', 'CFR-273']);

describe('validateCitations', () => {
  it('returns ok for valid ruleIds', () => {
    const result = validateCitations(['ELIG-GROSS-001', 'BEN-CALC-001'], mockRuleIndex);
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
  });

  it('returns error for unknown ruleIds', () => {
    const result = validateCitations(['ELIG-GROSS-001', 'FAKE-001'], mockRuleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['FAKE-001']);
  });

  it('returns error for empty citations array', () => {
    const result = validateCitations([], mockRuleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual([]);
    expect(result.error).toBe('At least one citation is required');
  });

  it('accepts slaIds and citationIds', () => {
    const result = validateCitations(['SLA-PROC-001', 'CFR-273'], mockRuleIndex);
    expect(result.valid).toBe(true);
  });

  it('returns all invalid ids when multiple are unknown', () => {
    const result = validateCitations(['FAKE-001', 'BOGUS-002'], mockRuleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['FAKE-001', 'BOGUS-002']);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/citations.test.ts`
Expected: FAIL -- module `@core/citations` not found

**Step 3: Write the implementation**

```typescript
// src/casework-core/citations.ts

export interface CitationValidationResult {
  valid: boolean;
  invalid: string[];
  error?: string;
}

export function validateCitations(
  citations: string[],
  ruleIndex: Set<string>,
): CitationValidationResult {
  if (citations.length === 0) {
    return { valid: false, invalid: [], error: 'At least one citation is required' };
  }

  const invalid = citations.filter((id) => !ruleIndex.has(id));

  if (invalid.length > 0) {
    return { valid: false, invalid, error: `Unknown ruleIds: ${invalid.join(', ')}` };
  }

  return { valid: true, invalid: [] };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/casework-core/citations.test.ts`
Expected: 5 tests PASS

**Step 5: Commit**

```bash
git add src/casework-core/citations.ts tests/casework-core/citations.test.ts
git commit -m "feat(core): citation validation against policy pack ruleIndex"
```

---

### Task 5: Database Migration -- Artifacts Table + Events Columns

Add the `artifacts` table and new columns on `events`.

**Files:**
- Create: `src/db/schema/artifacts.ts`
- Modify: `src/db/schema/events.ts` -- add `citations` and `artifactId` columns
- Modify: `src/db/schema/index.ts` -- export artifacts
- Test: `tests/db/schema.test.ts` -- add artifact schema tests

**Step 1: Add tests for the new schema**

Add these tests to the existing `tests/db/schema.test.ts`:

```typescript
// Add to existing imports
import { artifacts } from '@db/schema';

// Add new describe block
describe('artifacts schema', () => {
  it('has artifacts table defined', () => {
    expect(artifacts).toBeDefined();
  });

  it('artifacts has required columns', () => {
    const cols = Object.keys(artifacts);
    expect(cols).toContain('id');
    expect(cols).toContain('caseId');
    expect(cols).toContain('eventId');
    expect(cols).toContain('type');
    expect(cols).toContain('content');
    expect(cols).toContain('citations');
    expect(cols).toContain('createdAt');
  });
});

describe('events schema updates', () => {
  it('events has citations column', () => {
    const cols = Object.keys(events);
    expect(cols).toContain('citations');
  });

  it('events has artifactId column', () => {
    const cols = Object.keys(events);
    expect(cols).toContain('artifactId');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/db/schema.test.ts`
Expected: FAIL -- artifacts not exported, events missing new columns

**Step 3: Create artifacts schema**

```typescript
// src/db/schema/artifacts.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';
import { events } from './events';

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  eventId: uuid('event_id').notNull().references(() => events.id),
  type: text('type').notNull(),
  content: jsonb('content').notNull(),
  citations: text('citations').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 4: Modify events schema**

Add two new columns to `src/db/schema/events.ts`:

```typescript
// src/db/schema/events.ts
import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  citations: text('citations').array(),
  artifactId: uuid('artifact_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Note: `artifactId` is nullable and has no FK constraint here to avoid a circular dependency between events and artifacts tables. The application layer enforces the relationship.

**Step 5: Update barrel export**

```typescript
// src/db/schema/index.ts
export { cases } from './cases';
export { events } from './events';
export { artifacts } from './artifacts';
```

**Step 6: Run tests to verify they pass**

Run: `pnpm vitest run tests/db/schema.test.ts`
Expected: All tests PASS (existing + new)

**Step 7: Push schema to database**

Run: `echo "Yes" | pnpm drizzle-kit push --force`
Expected: Tables updated in Postgres (new artifacts table, events gets citations + artifact_id columns)

**Step 8: Commit**

```bash
git add src/db/schema/ tests/db/schema.test.ts
git commit -m "feat(db): artifacts table and events citations/artifactId columns"
```

---

### Task 6: Server-Side Policy Pack Loading

Load the policy pack at server startup and make it available to route handlers.

**Files:**
- Modify: `src/casework-api/index.ts` -- load policy pack at startup, attach to app
- Create: `src/casework-api/routes/policy-pack.ts` -- GET /policy-pack endpoint
- Modify: `src/casework-api/routes/index.ts` -- register new route

**Step 1: Modify server startup**

In `src/casework-api/index.ts`, after imports, before routes:

```typescript
import path from 'path';
import { loadPolicyPack, type PolicyPack } from '@core/policy-pack';

// Add to Express app setup (after app creation, before routes):
let policyPack: PolicyPack;

async function startServer() {
  // Load policy pack
  const packDir = path.resolve('policy-packs/snap-illinois-fy2026-v1');
  policyPack = await loadPolicyPack(packDir);
  console.log(`[POLICY] Loaded ${policyPack.meta.packId} (${policyPack.ruleIndex.size} rules)`);

  // Make available to routes via app.locals
  app.locals.policyPack = policyPack;

  // ... existing server.listen() etc.
}
```

Wrap the existing `server.listen()` call inside `startServer()`.

**Step 2: Create policy-pack route**

```typescript
// src/casework-api/routes/policy-pack.ts
import { Router } from 'express';
import type { PolicyPack } from '@core/policy-pack';
import type { ApiResponse } from '@shared/types';

const router = Router();

router.get('/', (req, res) => {
  const policyPack = req.app.locals.policyPack as PolicyPack;

  const response: ApiResponse = {
    success: true,
    data: {
      meta: policyPack.meta,
      ruleIds: Array.from(policyPack.ruleIndex).sort(),
    },
  };

  res.json(response);
});

export { router as policyPackRouter };
```

**Step 3: Register route in routes/index.ts**

```typescript
// Add to src/casework-api/routes/index.ts
import { policyPackRouter } from './policy-pack';

router.use('/policy-pack', policyPackRouter);
```

**Step 4: Verify manually**

Run server, then: `curl http://localhost:3002/api/policy-pack | jq .`
Expected: JSON with `meta.packId` and `ruleIds` array

**Step 5: Commit**

```bash
git add src/casework-api/index.ts src/casework-api/routes/policy-pack.ts src/casework-api/routes/index.ts
git commit -m "feat(api): load policy pack at startup, add GET /api/policy-pack endpoint"
```

---

### Task 7: Citation Enforcement + Artifact Creation in API Routes

Modify the cases routes to enforce citations and create artifacts.

**Files:**
- Modify: `src/casework-api/routes/cases.ts` -- enforce citations, handle artifacts
- Create: `src/casework-api/routes/artifacts.ts` -- GET /cases/:id/artifacts, GET /artifacts/:id
- Modify: `src/casework-api/routes/index.ts` -- register artifacts route
- Test: `tests/casework-api/routes/citations.test.ts`

**Step 1: Write the failing tests**

```typescript
// tests/casework-api/routes/citations.test.ts
import { describe, it, expect } from 'vitest';
import { validateCitations } from '@core/citations';
import { validateArtifact } from '@core/artifacts';

// Unit tests for the functions that routes will use.
// Full integration tests (HTTP) are done via manual smoke testing.

describe('citation enforcement integration', () => {
  const ruleIndex = new Set(['ELIG-GROSS-001', 'VER-MAND-001', 'NOT-VER-001', 'BEN-CALC-001']);

  it('rejects action with no citations', () => {
    const result = validateCitations([], ruleIndex);
    expect(result.valid).toBe(false);
  });

  it('accepts action with valid citations', () => {
    const result = validateCitations(['ELIG-GROSS-001'], ruleIndex);
    expect(result.valid).toBe(true);
  });

  it('validates artifact content matches type', () => {
    const result = validateArtifact('verification_request', {
      missingItems: ['identity'],
      deadline: '2026-03-05',
      consequences: 'Denial if not received',
      assistanceObligation: 'Agency will help',
    });
    expect(result.success).toBe(true);
  });

  it('rejects artifact with wrong content for type', () => {
    const result = validateArtifact('verification_request', {
      noticeType: 'approval',
    });
    expect(result.success).toBe(false);
  });
});
```

**Step 2: Run tests to verify they pass (these use already-built functions)**

Run: `pnpm vitest run tests/casework-api/routes/citations.test.ts`
Expected: 4 tests PASS (these test the core functions, not HTTP endpoints)

**Step 3: Modify cases.ts routes**

Update `src/casework-api/routes/cases.ts`:

```typescript
import { Router } from 'express';
import { db } from '@db/connection';
import { cases } from '@db/schema/cases';
import { events } from '@db/schema/events';
import { artifacts } from '@db/schema/artifacts';
import { eq, desc } from 'drizzle-orm';
import type { ApiResponse } from '@shared/types';
import type { PolicyPack } from '@core/policy-pack';
import { validateCitations } from '@core/citations';
import { validateArtifact } from '@core/artifacts';
import { broadcast } from '../websocket';
import { WS_EVENTS } from '@shared/constants';

const router = Router();

// GET /cases -- unchanged
router.get('/', async (_req, res) => {
  const rows = await db.select().from(cases).orderBy(desc(cases.createdAt));
  res.json({ success: true, data: rows } satisfies ApiResponse);
});

// GET /cases/:id -- unchanged
router.get('/:id', async (req, res) => {
  const row = await db.select().from(cases).where(eq(cases.id, req.params.id));
  if (row.length === 0) {
    res.status(404).json({ success: false, error: 'Case not found' } satisfies ApiResponse);
    return;
  }
  const caseEvents = await db.select().from(events).where(eq(events.caseId, req.params.id)).orderBy(desc(events.createdAt));
  res.json({ success: true, data: { ...row[0], events: caseEvents } } satisfies ApiResponse);
});

// GET /cases/:id/events -- unchanged
router.get('/:id/events', async (req, res) => {
  const rows = await db.select().from(events).where(eq(events.caseId, req.params.id)).orderBy(desc(events.createdAt));
  res.json({ success: true, data: rows } satisfies ApiResponse);
});

// POST /cases -- NOW REQUIRES CITATIONS
router.post('/', async (req, res) => {
  const policyPack = req.app.locals.policyPack as PolicyPack;
  const { citations: citationIds } = req.body as { citations?: string[] };

  // Citation enforcement
  if (!citationIds || !Array.isArray(citationIds)) {
    res.status(400).json({ success: false, error: 'citations array is required' } satisfies ApiResponse);
    return;
  }

  const citationResult = validateCitations(citationIds, policyPack.ruleIndex);
  if (!citationResult.valid) {
    res.status(400).json({ success: false, error: citationResult.error } satisfies ApiResponse);
    return;
  }

  const [newCase] = await db.insert(cases).values({ program: 'SNAP' }).returning();
  const [event] = await db.insert(events).values({
    caseId: newCase.id,
    actor: 'system',
    action: 'CASE_CREATED',
    payload: { status: newCase.status, program: newCase.program },
    citations: citationIds,
  }).returning();

  broadcast(WS_EVENTS.EVENT_CREATED, event);
  res.status(201).json({ success: true, data: { case: newCase, event } } satisfies ApiResponse);
});

// POST /cases/:id/events -- NOW REQUIRES CITATIONS, SUPPORTS ARTIFACTS
router.post('/:id/events', async (req, res) => {
  const policyPack = req.app.locals.policyPack as PolicyPack;
  const { action, actor, citations: citationIds, artifact } = req.body as {
    action: string;
    actor: string;
    citations?: string[];
    artifact?: { type: string; content: unknown };
  };

  // Citation enforcement
  if (!citationIds || !Array.isArray(citationIds)) {
    res.status(400).json({ success: false, error: 'citations array is required' } satisfies ApiResponse);
    return;
  }

  const citationResult = validateCitations(citationIds, policyPack.ruleIndex);
  if (!citationResult.valid) {
    res.status(400).json({ success: false, error: citationResult.error } satisfies ApiResponse);
    return;
  }

  // Validate artifact if provided
  if (artifact) {
    const artifactResult = validateArtifact(artifact.type, artifact.content);
    if (!artifactResult.success) {
      res.status(400).json({ success: false, error: `Invalid artifact: ${artifactResult.error}` } satisfies ApiResponse);
      return;
    }
  }

  // Create event
  const [event] = await db.insert(events).values({
    caseId: req.params.id,
    actor: actor || 'system',
    action,
    payload: req.body.payload || null,
    citations: citationIds,
  }).returning();

  // Create artifact if provided, then link back to event
  let artifactRecord = null;
  if (artifact) {
    [artifactRecord] = await db.insert(artifacts).values({
      caseId: req.params.id,
      eventId: event.id,
      type: artifact.type,
      content: artifact.content,
      citations: citationIds,
    }).returning();

    // Update event with artifact link
    await db.update(events).set({ artifactId: artifactRecord.id }).where(eq(events.id, event.id));
    event.artifactId = artifactRecord.id;
  }

  broadcast(WS_EVENTS.EVENT_CREATED, { ...event, artifact: artifactRecord });
  res.status(201).json({ success: true, data: { event, artifact: artifactRecord } } satisfies ApiResponse);
});

export { router as casesRouter };
```

**Step 4: Create artifacts route**

```typescript
// src/casework-api/routes/artifacts.ts
import { Router } from 'express';
import { db } from '@db/connection';
import { artifacts } from '@db/schema/artifacts';
import { eq, desc } from 'drizzle-orm';
import type { ApiResponse } from '@shared/types';

const router = Router();

// GET /artifacts/:id
router.get('/:id', async (req, res) => {
  const rows = await db.select().from(artifacts).where(eq(artifacts.id, req.params.id));
  if (rows.length === 0) {
    res.status(404).json({ success: false, error: 'Artifact not found' } satisfies ApiResponse);
    return;
  }
  res.json({ success: true, data: rows[0] } satisfies ApiResponse);
});

export { router as artifactsRouter };
```

**Step 5: Add case artifacts route + register new routers**

Add to the cases router in `cases.ts`:

```typescript
// GET /cases/:id/artifacts
router.get('/:id/artifacts', async (req, res) => {
  const rows = await db.select().from(artifacts).where(eq(artifacts.caseId, req.params.id)).orderBy(desc(artifacts.createdAt));
  res.json({ success: true, data: rows } satisfies ApiResponse);
});
```

Update `src/casework-api/routes/index.ts`:

```typescript
import { Router } from 'express';
import { healthRouter } from './health';
import { casesRouter } from './cases';
import { policyPackRouter } from './policy-pack';
import { artifactsRouter } from './artifacts';

const router = Router();
router.use('/health', healthRouter);
router.use('/cases', casesRouter);
router.use('/policy-pack', policyPackRouter);
router.use('/artifacts', artifactsRouter);

export { router };
```

**Step 6: Smoke test**

Restart server, then:

```bash
# Should fail -- no citations
curl -s -X POST http://localhost:3002/api/cases -H 'Content-Type: application/json' -d '{}' | jq .
# Expected: { "success": false, "error": "citations array is required" }

# Should succeed
curl -s -X POST http://localhost:3002/api/cases -H 'Content-Type: application/json' -d '{"citations": ["CFR-273"]}' | jq .
# Expected: { "success": true, "data": { "case": {...}, "event": {...} } }

# Create event with artifact
CASE_ID=<id from above>
curl -s -X POST "http://localhost:3002/api/cases/$CASE_ID/events" -H 'Content-Type: application/json' -d '{
  "action": "DOCUMENT_REQUESTED",
  "actor": "intake_clerk",
  "citations": ["VER-MAND-001", "NOT-VER-001"],
  "artifact": {
    "type": "verification_request",
    "content": {
      "missingItems": ["identity", "gross_nonexempt_income"],
      "deadline": "2026-03-05",
      "consequences": "Application may be denied.",
      "assistanceObligation": "The agency will help you obtain documents."
    }
  }
}' | jq .
# Expected: { "success": true, "data": { "event": {...}, "artifact": {...} } }

# Get artifacts for case
curl -s "http://localhost:3002/api/cases/$CASE_ID/artifacts" | jq .
# Expected: array with 1 artifact

# Get policy pack
curl -s http://localhost:3002/api/policy-pack | jq .data.ruleIds
# Expected: sorted array of all rule IDs
```

**Step 7: Commit**

```bash
git add src/casework-api/routes/ tests/casework-api/routes/citations.test.ts
git commit -m "feat(api): citation enforcement and artifact creation on all state-changing routes"
```

---

### Task 8: Update Shared Types + Constants

Add artifact-related types and constants for the UI.

**Files:**
- Modify: `src/shared/types.ts` -- add ArtifactRecord type
- Modify: `src/shared/constants.ts` -- add artifact types constant

**Step 1: Update types**

Add to `src/shared/types.ts`:

```typescript
export interface ArtifactRecord {
  id: string;
  caseId: string;
  eventId: string;
  type: string;
  content: Record<string, unknown>;
  citations: string[];
  createdAt: string;
}
```

Update `EventRecord` to include optional artifact fields:

```typescript
export interface EventRecord {
  id: string;
  caseId: string;
  actor: string;
  action: EventAction;
  payload: Record<string, unknown> | null;
  citations: string[] | null;
  artifactId: string | null;
  createdAt: string;
}
```

**Step 2: Update constants**

Add to `src/shared/constants.ts`:

```typescript
export const ARTIFACT_TYPES = [
  'verification_request',
  'determination_worksheet',
  'notice',
] as const;
```

**Step 3: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts
git commit -m "feat(shared): add ArtifactRecord type and ARTIFACT_TYPES constant"
```

---

### Task 9: UI -- Enhanced EventLog with Artifacts

Enhance the EventLog page: citations display, expandable artifacts, and updated create-case form.

**Files:**
- Modify: `src/casework-ui/lib/api.ts` -- add artifact and policy-pack API calls
- Modify: `src/casework-ui/pages/EventLog.tsx` -- full rewrite with artifact support
- Create: `src/casework-ui/components/ArtifactViewer.tsx` -- renders artifact content by type
- Create: `src/casework-ui/components/CreateCaseForm.tsx` -- create case with citations

**Step 1: Update API client**

Add to `src/casework-ui/lib/api.ts`:

```typescript
getCaseArtifacts: (caseId: string) => request<ArtifactRecord[]>(`/cases/${caseId}/artifacts`),
getArtifact: (id: string) => request<ArtifactRecord>(`/artifacts/${id}`),
getPolicyPack: () => request<{ meta: Record<string, string>; ruleIds: string[] }>('/policy-pack'),
```

Update `createCase` to accept citations:

```typescript
createCase: (citations: string[]) =>
  request<{ case: CaseRecord; event: EventRecord }>('/cases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ citations }),
  }),
```

Update `createEvent` to accept citations and optional artifact:

```typescript
createEvent: (caseId: string, data: {
  action: string;
  actor: string;
  citations: string[];
  artifact?: { type: string; content: unknown };
}) =>
  request(`/cases/${caseId}/events`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }),
```

**Step 2: Create ArtifactViewer component**

```tsx
// src/casework-ui/components/ArtifactViewer.tsx
import type { ArtifactRecord } from '@shared/types';

export function ArtifactViewer({ artifact }: { artifact: ArtifactRecord }) {
  const content = artifact.content as Record<string, unknown>;

  if (artifact.type === 'verification_request') {
    const items = content.missingItems as string[];
    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-yellow-800/50">
        <div className="text-xs font-semibold text-yellow-400 mb-2">Verification Request</div>
        <div className="text-xs text-gray-300 space-y-1">
          <div><span className="text-gray-500">Missing:</span> {items.join(', ')}</div>
          <div><span className="text-gray-500">Deadline:</span> {content.deadline as string}</div>
          <div><span className="text-gray-500">Consequences:</span> {content.consequences as string}</div>
          <div><span className="text-gray-500">Agency obligation:</span> {content.assistanceObligation as string}</div>
        </div>
      </div>
    );
  }

  if (artifact.type === 'determination_worksheet') {
    const ded = content.deductions as Record<string, number>;
    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-blue-800/50">
        <div className="text-xs font-semibold text-blue-400 mb-2">Determination Worksheet</div>
        <div className={`text-sm font-medium mb-2 ${content.eligible ? 'text-green-400' : 'text-red-400'}`}>
          {content.eligible ? 'ELIGIBLE' : 'DENIED'}
          {content.reason && <span className="text-gray-400 text-xs ml-2">— {content.reason as string}</span>}
        </div>
        <table className="text-xs text-gray-300 w-full">
          <tbody>
            <tr><td className="text-gray-500 pr-4">Gross income</td><td>${content.grossIncome as number}</td></tr>
            <tr><td className="text-gray-500 pr-4">Standard ded.</td><td>-${ded.standard}</td></tr>
            <tr><td className="text-gray-500 pr-4">Earned income ded.</td><td>-${ded.earnedIncome}</td></tr>
            <tr><td className="text-gray-500 pr-4">Dependent care</td><td>-${ded.dependentCare}</td></tr>
            <tr><td className="text-gray-500 pr-4">Child support</td><td>-${ded.childSupport}</td></tr>
            <tr><td className="text-gray-500 pr-4">Medical</td><td>-${ded.medical}</td></tr>
            <tr><td className="text-gray-500 pr-4">Excess shelter</td><td>-${ded.excessShelter}</td></tr>
            <tr className="border-t border-gray-700"><td className="text-gray-500 pr-4 pt-1">Net income</td><td className="pt-1">${content.netIncome as number}</td></tr>
            <tr className="font-medium"><td className="text-gray-400 pr-4">Benefit amount</td><td className="text-green-400">${content.benefitAmount as number}/mo</td></tr>
          </tbody>
        </table>
      </div>
    );
  }

  if (artifact.type === 'notice') {
    const fields = content.fields as Record<string, string>;
    return (
      <div className="mt-2 p-3 bg-gray-800 rounded border border-purple-800/50">
        <div className="text-xs font-semibold text-purple-400 mb-2">
          Notice — {(content.noticeType as string).toUpperCase()}
        </div>
        <div className="text-xs text-gray-300 space-y-1">
          <div><span className="text-gray-500">To:</span> {content.recipientName as string}</div>
          <div><span className="text-gray-500">Date:</span> {content.noticeDate as string}</div>
          <div><span className="text-gray-500">Template:</span> {content.templateId as string}</div>
          {Object.entries(fields).map(([k, v]) => (
            <div key={k}><span className="text-gray-500">{k}:</span> {v}</div>
          ))}
        </div>
      </div>
    );
  }

  // Fallback: raw JSON
  return (
    <pre className="mt-2 text-xs text-gray-500 font-mono overflow-x-auto bg-gray-800 p-2 rounded">
      {JSON.stringify(content, null, 2)}
    </pre>
  );
}
```

**Step 3: Create CreateCaseForm component**

```tsx
// src/casework-ui/components/CreateCaseForm.tsx
import { useState } from 'react';
import { api } from '@ui/lib/api';

export function CreateCaseForm({ ruleIds, onCreated }: { ruleIds: string[]; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [citation, setCitation] = useState('CFR-273');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    setLoading(true);
    const res = await api.createCase([citation]);
    setLoading(false);
    if (res.success) {
      setOpen(false);
      onCreated();
    } else {
      setError(res.error || 'Failed to create case');
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-md transition-colors"
      >
        Create Case
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={citation}
        onChange={(e) => setCitation(e.target.value)}
        className="bg-gray-800 border border-gray-700 text-gray-300 text-xs rounded px-2 py-1.5"
      >
        {ruleIds.map((id) => (
          <option key={id} value={id}>{id}</option>
        ))}
      </select>
      <button
        onClick={handleSubmit}
        disabled={loading}
        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
      >
        {loading ? '...' : 'Submit'}
      </button>
      <button
        onClick={() => setOpen(false)}
        className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 text-xs rounded transition-colors"
      >
        Cancel
      </button>
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}
```

**Step 4: Rewrite EventLog page**

Full replacement of `src/casework-ui/pages/EventLog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { api } from '@ui/lib/api';
import { connectWebSocket, onEvent } from '@ui/lib/websocket';
import { WS_EVENTS } from '@shared/constants';
import type { EventRecord, ArtifactRecord } from '@shared/types';
import { ArtifactViewer } from '@ui/components/ArtifactViewer';
import { CreateCaseForm } from '@ui/components/CreateCaseForm';

interface EventWithArtifact extends EventRecord {
  artifact?: ArtifactRecord | null;
}

export function EventLog() {
  const [events, setEvents] = useState<EventWithArtifact[]>([]);
  const [ruleIds, setRuleIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Load policy pack ruleIds
  useEffect(() => {
    (async () => {
      const res = await api.getPolicyPack();
      if (res.success && res.data) {
        setRuleIds((res.data as { ruleIds: string[] }).ruleIds);
      }
    })();
  }, []);

  // Load all events on mount
  useEffect(() => {
    (async () => {
      const res = await api.getCases();
      if (res.success && Array.isArray(res.data)) {
        const allEvents: EventWithArtifact[] = [];
        for (const c of res.data as { id: string }[]) {
          const evRes = await api.getCaseEvents(c.id);
          if (evRes.success && Array.isArray(evRes.data)) {
            allEvents.push(...(evRes.data as EventWithArtifact[]));
          }
        }
        allEvents.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setEvents(allEvents);
      }
    })();
  }, []);

  // Subscribe to real-time events
  useEffect(() => {
    connectWebSocket();
    const unsub = onEvent(WS_EVENTS.EVENT_CREATED, (data) => {
      setEvents((prev) => [data as EventWithArtifact, ...prev]);
    });
    return unsub;
  }, []);

  const toggleExpand = async (ev: EventWithArtifact) => {
    if (expandedId === ev.id) {
      setExpandedId(null);
      return;
    }
    // Fetch artifact if event has one but we haven't loaded it yet
    if (ev.artifactId && !ev.artifact) {
      const res = await api.getArtifact(ev.artifactId);
      if (res.success && res.data) {
        setEvents((prev) =>
          prev.map((e) => (e.id === ev.id ? { ...e, artifact: res.data as ArtifactRecord } : e))
        );
      }
    }
    setExpandedId(ev.id);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-semibold">Benefits Casework Lab</h1>
        <CreateCaseForm ruleIds={ruleIds} onCreated={() => {}} />
      </div>

      <h2 className="text-lg font-medium mb-4 text-gray-400">Event Log</h2>

      {events.length === 0 ? (
        <p className="text-gray-500 text-sm">No events yet. Create a case to get started.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li
              key={ev.id}
              className={`bg-gray-900 border rounded-md px-4 py-3 ${
                ev.artifactId ? 'border-gray-700 cursor-pointer hover:border-gray-600' : 'border-gray-800'
              }`}
              onClick={() => ev.artifactId && toggleExpand(ev)}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono font-medium text-blue-400">{ev.action}</span>
                  {ev.artifactId && (
                    <span className="text-[10px] px-1.5 py-0.5 bg-purple-900/50 text-purple-400 rounded font-medium">
                      artifact
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {new Date(ev.createdAt).toLocaleTimeString()}
                </span>
              </div>
              <div className="text-xs text-gray-400">
                <span className="text-gray-500">actor:</span> {ev.actor}
                <span className="ml-3 text-gray-500">case:</span> {ev.caseId.slice(0, 8)}...
              </div>

              {/* Citations */}
              {ev.citations && ev.citations.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {ev.citations.map((c) => (
                    <span key={c} className="text-[10px] px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded font-mono">
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {/* Expanded artifact */}
              {expandedId === ev.id && ev.artifact && (
                <ArtifactViewer artifact={ev.artifact} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

**Step 5: Verify in browser**

1. Open http://localhost:5174
2. Create a case using the citation dropdown (CFR-273)
3. Via curl, create events with artifacts on that case (verification request, worksheet, notice)
4. Refresh the page, verify:
   - Events show citation tags
   - Events with artifacts show purple "artifact" badge
   - Clicking an artifact event expands the viewer inline
   - Each artifact type renders its specific view

**Step 6: Commit**

```bash
git add src/casework-ui/
git commit -m "feat(ui): enhanced event log with expandable artifacts and citation display"
```

---

### Task 10: End-to-End Verification + Run All Tests

Full verification that M1 exit criteria are met.

**Step 1: Run all tests**

Run: `pnpm test`
Expected: All tests pass (existing M0 tests + new M1 tests)

**Step 2: End-to-end walkthrough via curl**

```bash
# 1. Create a case
CASE=$(curl -s -X POST http://localhost:3002/api/cases \
  -H 'Content-Type: application/json' \
  -d '{"citations": ["CFR-273"]}')
CASE_ID=$(echo $CASE | jq -r '.data.case.id')
echo "Case: $CASE_ID"

# 2. Verification request artifact
curl -s -X POST "http://localhost:3002/api/cases/$CASE_ID/events" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "DOCUMENT_REQUESTED",
    "actor": "intake_clerk",
    "citations": ["VER-MAND-001", "NOT-VER-001"],
    "artifact": {
      "type": "verification_request",
      "content": {
        "missingItems": ["identity", "gross_nonexempt_income"],
        "deadline": "2026-03-05",
        "consequences": "Application may be denied if documents not received by deadline.",
        "assistanceObligation": "The agency will assist you in obtaining required documents."
      }
    }
  }'

# 3. Determination worksheet artifact
curl -s -X POST "http://localhost:3002/api/cases/$CASE_ID/events" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "DETERMINATION_MADE",
    "actor": "caseworker",
    "citations": ["ELIG-GROSS-001", "ELIG-NET-001", "DED-STD-001", "DED-EARN-001", "DED-SHLT-001", "BEN-CALC-001", "BEN-ALLOT-001"],
    "artifact": {
      "type": "determination_worksheet",
      "content": {
        "eligible": true,
        "grossIncome": 2500,
        "netIncome": 1800,
        "benefitAmount": 450,
        "deductions": {
          "standard": 205,
          "earnedIncome": 300,
          "dependentCare": 0,
          "childSupport": 0,
          "medical": 0,
          "excessShelter": 195
        }
      }
    }
  }'

# 4. Notice artifact
curl -s -X POST "http://localhost:3002/api/cases/$CASE_ID/events" \
  -H 'Content-Type: application/json' \
  -d '{
    "action": "NOTICE_GENERATED",
    "actor": "caseworker",
    "citations": ["NOT-APPR-001"],
    "artifact": {
      "type": "notice",
      "content": {
        "noticeType": "approval",
        "recipientName": "Jane Doe",
        "noticeDate": "2026-02-25",
        "fields": {
          "benefit_amount": "$450/month",
          "certification_period": "2026-03 to 2026-08",
          "fair_hearing_rights": "You may request a fair hearing within 90 days."
        },
        "templateId": "approval-notice"
      }
    }
  }'

# 5. Verify 3 artifacts on the case
curl -s "http://localhost:3002/api/cases/$CASE_ID/artifacts" | jq '.data | length'
# Expected: 3
```

**Step 3: Verify in browser**

Open http://localhost:5174 and confirm:
- The case appears with 4 events (CASE_CREATED + 3 artifact-producing events)
- Each artifact event shows the purple "artifact" badge
- Clicking each expands the appropriate viewer (yellow for verification, blue for worksheet, purple for notice)
- All events show citation tags

**Exit criteria met:** A single case has a timeline with at least 3 artifacts (verification request, determination worksheet, notice).

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: M1 artifact spine complete -- citation enforcement + 3 artifact types + viewer"
```

---

### Task 11: Push + PR

**Step 1: Push branch**

```bash
git push -u origin feature/m1-artifact-spine
```

**Step 2: Create PR**

```bash
gh pr create --base main --head feature/m1-artifact-spine \
  --title "feat: M1 artifact spine -- citations, policy pack, artifact viewer" \
  --body "$(cat <<'EOF'
## Summary
- Illinois SNAP FY2026 policy pack loaded from filesystem (30+ ruleIds)
- Citation enforcement: all state-changing actions require valid ruleId citations
- Artifacts table with Zod-validated types: verification_request, determination_worksheet, notice
- Enhanced EventLog UI with expandable inline artifact viewer and citation tags
- M1 exit criteria met: single case with 3 artifacts visible in timeline

## Test Plan
- [x] Policy pack loader tests (6 tests)
- [x] Artifact Zod schema tests (9 tests)
- [x] Citation validation tests (5 tests)
- [x] API citation enforcement tests (4 tests)
- [x] DB schema tests (artifacts table + events columns)
- [x] End-to-end: create case + 3 artifacts via curl, verify in browser

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
