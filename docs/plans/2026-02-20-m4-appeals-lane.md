# M4 -- Appeals Lane Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the appeal lifecycle (filing, hearing, decision, implementation) to the state machine with three scenario variants (favorable reversal, unfavorable upheld, remand reopened) and full artifact schemas, so that the appeal reversal scenario is fully replayable.

**Architecture:** Additive extension of the existing state machine, runner, and scenario infrastructure. New appeal actions/states/guards are added to existing files. A new `appeal-reversal.ts` scenario generator produces standalone denied cases with oracle-driven outcomes. Appeal artifact Zod schemas validate structured data stored in the DB.

**Tech Stack:** TypeScript, Vitest, Zod, Drizzle ORM, Express, React

---

## Context for the Implementer

**Current state machine** (`src/casework-core/state-machine.ts`):
- States: RECEIVED, PENDING_VERIFICATION, READY_FOR_DETERMINATION, DETERMINED_APPROVED, DETERMINED_DENIED, NOTICE_SENT, IMPLEMENTED, CLOSED (plus APPEAL_REQUESTED and APPEAL_DECIDED which exist in constants but have no transitions)
- Transition table only covers the "missing-docs" path: RECEIVED -> PENDING_VERIFICATION -> READY_FOR_DETERMINATION -> DETERMINED_*/NOTICE_SENT -> IMPLEMENTED -> CLOSED
- No appeal actions exist in `CASE_ACTIONS`

**What we're building:**
- `APPEAL_HEARING_SCHEDULED` state (new)
- 6 new actions: `appeal_filed`, `schedule_hearing`, `render_decision`, `implement_favorable`, `implement_unfavorable`, `reopen_case`
- 4 new guards for SLA enforcement
- Appeal reversal scenario generator with 3 variants
- Zod schemas for 3 appeal artifact types
- DB table for appeal artifacts
- Runner, metrics, API, and UI updates

**Key files you'll touch:**
- `src/shared/constants.ts` -- add state + actions + scenario
- `src/casework-core/state-machine.ts` -- transitions, guards, role permissions
- `src/casework-core/scenarios/appeal-reversal.ts` -- new scenario generator
- `src/casework-core/artifacts/appeal-artifacts.ts` -- Zod schemas
- `src/casework-core/runner.ts` -- `runAppealReversalScenario()`
- `src/casework-core/metrics.ts` -- appeal metrics
- `src/db/schema/appeal-artifacts.ts` -- DB table
- `src/casework-api/routes/runs.ts` -- handle `appeal_reversal` scenario
- `src/shared/types.ts` -- appeal metrics on RunSummaryRecord
- `src/casework-ui/` -- UI updates

**Test command:** `npx vitest run` (from project root)
**Single test:** `npx vitest run tests/path/to/file.test.ts`
**Dev server:** `npm run dev` (starts API on :3001, UI on :5174)

---

### Task 1: Add Appeal Constants

**Files:**
- Modify: `src/shared/constants.ts:9-60`

**Step 1: Add APPEAL_HEARING_SCHEDULED to CASE_STATUSES**

In `src/shared/constants.ts`, the `CASE_STATUSES` array (line 9-20) currently has `APPEAL_REQUESTED` and `APPEAL_DECIDED` but is missing `APPEAL_HEARING_SCHEDULED`. Insert it between those two:

```typescript
export const CASE_STATUSES = [
  'RECEIVED',
  'PENDING_VERIFICATION',
  'READY_FOR_DETERMINATION',
  'DETERMINED_APPROVED',
  'DETERMINED_DENIED',
  'NOTICE_SENT',
  'APPEAL_REQUESTED',
  'APPEAL_HEARING_SCHEDULED',
  'APPEAL_DECIDED',
  'IMPLEMENTED',
  'CLOSED',
] as const;
```

**Step 2: Add appeal actions to CASE_ACTIONS**

Append 6 new actions to `CASE_ACTIONS` (line 39-51):

```typescript
export const CASE_ACTIONS = [
  'create_case',
  'request_verification',
  'receive_verification',
  'verification_complete',
  'verification_refused',
  'approve',
  'deny',
  'send_notice',
  'implement',
  'close_case',
  'close_abandoned',
  'appeal_filed',
  'schedule_hearing',
  'render_decision',
  'implement_favorable',
  'implement_unfavorable',
  'reopen_case',
] as const;
```

**Step 3: Add `appeal_reversal` to SCENARIOS**

Change line 60:

```typescript
export const SCENARIOS = ['missing_docs', 'appeal_reversal'] as const;
```

**Step 4: Add `hearing_officer` to ROLES**

```typescript
export const ROLES = [
  'intake_clerk',
  'caseworker',
  'supervisor',
  'hearing_officer',
  'system',
] as const;
```

**Step 5: Add appeal artifact types to ARTIFACT_TYPES**

```typescript
export const ARTIFACT_TYPES = [
  'verification_request',
  'determination_worksheet',
  'notice',
  'appeal_request',
  'hearing_record',
  'appeal_decision',
] as const;
```

**Step 6: Add appeal event actions to EVENT_ACTIONS**

```typescript
export const EVENT_ACTIONS = [
  'CASE_CREATED',
  'STATUS_CHANGED',
  'DOCUMENT_REQUESTED',
  'DOCUMENT_RECEIVED',
  'DETERMINATION_MADE',
  'NOTICE_GENERATED',
  'APPEAL_FILED',
  'APPEAL_DECIDED',
  'HEARING_SCHEDULED',
  'APPEAL_IMPLEMENTED',
] as const;
```

**Step 7: Run tests**

Run: `npx vitest run`
Expected: All 178 existing tests still pass. The constants are just arrays -- no logic depends on specific values at this point except the state machine's type checking, which will require the next task.

**Step 8: Commit**

```bash
git add src/shared/constants.ts
git commit -m "feat(m4): add appeal states, actions, roles, and scenario to constants"
```

---

### Task 2: Extend State Machine with Appeal Transitions + Guards

**Files:**
- Modify: `src/casework-core/state-machine.ts:63-187`
- Test: `tests/casework-core/state-machine.test.ts`

**Step 1: Write the failing tests**

Add a new `describe('appeal transitions', ...)` block to `tests/casework-core/state-machine.test.ts`:

```typescript
describe('appeal transitions', () => {
  const baseCaseData: CaseData = {
    applicantName: 'Test Appeal',
    householdSize: 3,
    requiredVerifications: ['identity', 'income'],
    verifiedItems: ['identity', 'income'],
    missingItems: [],
    applicationFiledAt: new Date('2026-01-01'),
    determinationResult: 'denied',
    noticeSentAt: new Date('2026-01-15'),
  };

  const basePolicyPack = {
    sla: {} as Record<string, unknown>,
    ruleIndex: new Set(['ELIG-GROSS-001', 'CFR-273-15']),
  };

  it('appeal_filed: NOTICE_SENT -> APPEAL_REQUESTED (within 90 days)', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'NOTICE_SENT',
      actor: { role: 'system', agentId: 'system' },
      timestamp: new Date('2026-02-01'), // 17 days after notice
      caseData: { ...baseCaseData },
      policyPack: basePolicyPack,
    };
    const result = transition('NOTICE_SENT', 'appeal_filed', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newState).toBe('APPEAL_REQUESTED');
  });

  it('appeal_filed: blocked after 90 days', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'NOTICE_SENT',
      actor: { role: 'system', agentId: 'system' },
      timestamp: new Date('2026-05-01'), // 106 days after notice
      caseData: { ...baseCaseData },
      policyPack: basePolicyPack,
    };
    const result = transition('NOTICE_SENT', 'appeal_filed', ctx);
    expect(result.ok).toBe(false);
  });

  it('schedule_hearing: APPEAL_REQUESTED -> APPEAL_HEARING_SCHEDULED', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_REQUESTED',
      actor: { role: 'supervisor', agentId: 'super-1' },
      timestamp: new Date('2026-02-05'),
      caseData: { ...baseCaseData, appealFiledAt: new Date('2026-02-01') },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_REQUESTED', 'schedule_hearing', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newState).toBe('APPEAL_HEARING_SCHEDULED');
  });

  it('render_decision: APPEAL_HEARING_SCHEDULED -> APPEAL_DECIDED (10+ days after scheduling)', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_HEARING_SCHEDULED',
      actor: { role: 'hearing_officer', agentId: 'ho-1' },
      timestamp: new Date('2026-03-01'), // well past 10 days
      caseData: {
        ...baseCaseData,
        appealFiledAt: new Date('2026-02-01'),
        hearingScheduledAt: new Date('2026-02-05'),
        hearingDate: new Date('2026-02-25'),
      },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_HEARING_SCHEDULED', 'render_decision', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newState).toBe('APPEAL_DECIDED');
  });

  it('render_decision: blocked if hearing < 10 days after scheduling', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_HEARING_SCHEDULED',
      actor: { role: 'hearing_officer', agentId: 'ho-1' },
      timestamp: new Date('2026-02-10'),
      caseData: {
        ...baseCaseData,
        appealFiledAt: new Date('2026-02-01'),
        hearingScheduledAt: new Date('2026-02-05'),
        hearingDate: new Date('2026-02-08'), // only 3 days after scheduling
      },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_HEARING_SCHEDULED', 'render_decision', ctx);
    expect(result.ok).toBe(false);
  });

  it('implement_favorable: APPEAL_DECIDED -> IMPLEMENTED', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_DECIDED',
      actor: { role: 'supervisor', agentId: 'super-1' },
      timestamp: new Date('2026-03-05'),
      caseData: { ...baseCaseData, appealDecision: 'favorable' },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_DECIDED', 'implement_favorable', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newState).toBe('IMPLEMENTED');
  });

  it('implement_unfavorable: APPEAL_DECIDED -> IMPLEMENTED', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_DECIDED',
      actor: { role: 'supervisor', agentId: 'super-1' },
      timestamp: new Date('2026-03-05'),
      caseData: { ...baseCaseData, appealDecision: 'unfavorable' },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_DECIDED', 'implement_unfavorable', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newState).toBe('IMPLEMENTED');
  });

  it('reopen_case: APPEAL_DECIDED -> READY_FOR_DETERMINATION', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_DECIDED',
      actor: { role: 'supervisor', agentId: 'super-1' },
      timestamp: new Date('2026-03-05'),
      caseData: { ...baseCaseData, appealDecision: 'remand' },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_DECIDED', 'reopen_case', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.newState).toBe('READY_FOR_DETERMINATION');
  });

  it('role check: caseworker cannot schedule hearing', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_REQUESTED',
      actor: { role: 'caseworker', agentId: 'worker-1' },
      timestamp: new Date('2026-02-05'),
      caseData: { ...baseCaseData },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_REQUESTED', 'schedule_hearing', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('not permitted');
  });

  it('role check: hearing_officer can render_decision', () => {
    const ctx: TransitionContext = {
      caseId: 'case-1',
      currentState: 'APPEAL_HEARING_SCHEDULED',
      actor: { role: 'hearing_officer', agentId: 'ho-1' },
      timestamp: new Date('2026-03-01'),
      caseData: {
        ...baseCaseData,
        hearingScheduledAt: new Date('2026-02-05'),
        hearingDate: new Date('2026-02-25'),
      },
      policyPack: basePolicyPack,
    };
    const result = transition('APPEAL_HEARING_SCHEDULED', 'render_decision', ctx);
    expect(result.ok).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/casework-core/state-machine.test.ts`
Expected: FAIL -- new tests reference `noticeSentAt`, `appealFiledAt`, `hearingScheduledAt`, `hearingDate`, `appealDecision` which don't exist on CaseData yet, and the transition table doesn't have appeal entries.

**Step 3: Extend CaseData interface**

In `src/casework-core/state-machine.ts`, add to the `CaseData` interface (after `determinationResult?`):

```typescript
export interface CaseData {
  applicantName: string;
  householdSize: number;
  requiredVerifications: string[];
  verifiedItems: string[];
  missingItems: string[];
  verificationRequestedAt?: Date;
  applicationFiledAt: Date;
  determinationResult?: 'approved' | 'denied';
  noticeSentAt?: Date;
  appealFiledAt?: Date;
  appealReason?: string;
  hearingScheduledAt?: Date;
  hearingDate?: Date;
  appealDecision?: 'favorable' | 'unfavorable' | 'remand';
  originalDenialReason?: string;
}
```

**Step 4: Add appeal role permissions**

Extend `ROLE_PERMISSIONS` (line 63-75) to include the 6 new actions:

```typescript
export const ROLE_PERMISSIONS: Record<CaseAction, readonly Role[]> = {
  create_case: ['intake_clerk', 'system'],
  request_verification: ['intake_clerk'],
  receive_verification: ['intake_clerk'],
  verification_complete: ['caseworker'],
  verification_refused: ['intake_clerk'],
  approve: ['caseworker'],
  deny: ['caseworker'],
  send_notice: ['caseworker'],
  implement: ['supervisor'],
  close_case: ['supervisor'],
  close_abandoned: ['system'],
  appeal_filed: ['system'],
  schedule_hearing: ['supervisor'],
  render_decision: ['supervisor', 'hearing_officer'],
  implement_favorable: ['supervisor'],
  implement_unfavorable: ['supervisor'],
  reopen_case: ['supervisor'],
};
```

**Step 5: Add appeal transitions to TRANSITION_TABLE**

Add new entries to the transition table:

```typescript
export const TRANSITION_TABLE: Partial<
  Record<CaseStatus, Partial<Record<CaseAction, CaseStatus>>>
> = {
  RECEIVED: {
    request_verification: 'PENDING_VERIFICATION',
  },
  PENDING_VERIFICATION: {
    receive_verification: 'PENDING_VERIFICATION',
    verification_complete: 'READY_FOR_DETERMINATION',
    verification_refused: 'DETERMINED_DENIED',
    close_abandoned: 'CLOSED',
  },
  READY_FOR_DETERMINATION: {
    approve: 'DETERMINED_APPROVED',
    deny: 'DETERMINED_DENIED',
  },
  DETERMINED_APPROVED: {
    send_notice: 'NOTICE_SENT',
  },
  DETERMINED_DENIED: {
    send_notice: 'NOTICE_SENT',
  },
  NOTICE_SENT: {
    implement: 'IMPLEMENTED',
    appeal_filed: 'APPEAL_REQUESTED',
  },
  APPEAL_REQUESTED: {
    schedule_hearing: 'APPEAL_HEARING_SCHEDULED',
  },
  APPEAL_HEARING_SCHEDULED: {
    render_decision: 'APPEAL_DECIDED',
  },
  APPEAL_DECIDED: {
    implement_favorable: 'IMPLEMENTED',
    implement_unfavorable: 'IMPLEMENTED',
    reopen_case: 'READY_FOR_DETERMINATION',
  },
  IMPLEMENTED: {
    close_case: 'CLOSED',
  },
};
```

**Step 6: Add appeal guard functions**

Add these guard functions before the `GUARDS` record:

```typescript
/**
 * SLA-APP-001: Appeal must be filed within 90 calendar days of notice.
 */
export function guardAppealDeadline(ctx: TransitionContext): GuardResult {
  const { noticeSentAt } = ctx.caseData;

  if (!noticeSentAt) {
    return {
      guardName: 'guardAppealDeadline',
      passed: false,
      reason: 'No notice sent date recorded',
      citation: 'SLA-APP-001',
    };
  }

  const elapsed = ctx.timestamp.getTime() - noticeSentAt.getTime();
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;

  if (elapsed <= ninetyDaysMs) {
    return {
      guardName: 'guardAppealDeadline',
      passed: true,
      citation: 'SLA-APP-001',
    };
  }

  return {
    guardName: 'guardAppealDeadline',
    passed: false,
    reason: `Appeal filed ${Math.floor(elapsed / (24 * 60 * 60 * 1000))} days after notice (max 90)`,
    citation: 'SLA-APP-001',
  };
}

/**
 * SLA-APP-002: Hearing date must be at least 10 days after scheduling.
 */
export function guardHearingNotice(ctx: TransitionContext): GuardResult {
  const { hearingScheduledAt, hearingDate } = ctx.caseData;

  if (!hearingScheduledAt || !hearingDate) {
    return {
      guardName: 'guardHearingNotice',
      passed: false,
      reason: 'Hearing scheduling date or hearing date not recorded',
      citation: 'SLA-APP-002',
    };
  }

  const elapsed = hearingDate.getTime() - hearingScheduledAt.getTime();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

  if (elapsed >= tenDaysMs) {
    return {
      guardName: 'guardHearingNotice',
      passed: true,
      citation: 'SLA-APP-002',
    };
  }

  return {
    guardName: 'guardHearingNotice',
    passed: false,
    reason: `Hearing only ${Math.floor(elapsed / (24 * 60 * 60 * 1000))} days after scheduling (min 10)`,
    citation: 'SLA-APP-002',
  };
}
```

**Step 7: Register guards in GUARDS record**

Extend the `GUARDS` record to include all 6 new actions:

```typescript
export const GUARDS: Record<CaseAction, GuardFn[]> = {
  create_case: [],
  request_verification: [],
  receive_verification: [],
  verification_complete: [guardVerificationComplete],
  verification_refused: [guardSlaVerMinDays],
  approve: [],
  deny: [],
  send_notice: [],
  implement: [],
  close_case: [],
  close_abandoned: [],
  appeal_filed: [guardAppealDeadline],
  schedule_hearing: [],
  render_decision: [guardHearingNotice],
  implement_favorable: [],
  implement_unfavorable: [],
  reopen_case: [],
};
```

**Step 8: Run tests**

Run: `npx vitest run tests/casework-core/state-machine.test.ts`
Expected: All new and existing state machine tests PASS.

**Step 9: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (some existing tests may need the CaseData type update to compile).

**Step 10: Commit**

```bash
git add src/casework-core/state-machine.ts tests/casework-core/state-machine.test.ts
git commit -m "feat(m4): add appeal transitions, guards, and role permissions to state machine"
```

---

### Task 3: Appeal Artifact Zod Schemas

**Files:**
- Create: `src/casework-core/artifacts/appeal-artifacts.ts`
- Test: `tests/casework-core/appeal-artifacts.test.ts`

**Step 1: Write the failing tests**

Create `tests/casework-core/appeal-artifacts.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  AppealRequestSchema,
  HearingRecordSchema,
  AppealDecisionSchema,
  type AppealRequest,
  type HearingRecord,
  type AppealDecision,
} from '@core/artifacts/appeal-artifacts';

describe('AppealRequestSchema', () => {
  it('validates a correct appeal request', () => {
    const data: AppealRequest = {
      appealId: '550e8400-e29b-41d4-a716-446655440000',
      caseId: 'case-123',
      filedAt: '2026-02-15',
      reason: 'Income was calculated incorrectly',
      citedErrors: ['Gross income test used wrong threshold'],
      requestedRelief: 'Recalculation of eligibility with correct income figures',
    };
    expect(AppealRequestSchema.parse(data)).toEqual(data);
  });

  it('rejects missing fields', () => {
    expect(() => AppealRequestSchema.parse({ appealId: 'x' })).toThrow();
  });

  it('rejects empty reason', () => {
    expect(() => AppealRequestSchema.parse({
      appealId: 'x', caseId: 'y', filedAt: '2026-01-01',
      reason: '', citedErrors: [], requestedRelief: 'Fix it',
    })).toThrow();
  });
});

describe('HearingRecordSchema', () => {
  it('validates a correct hearing record', () => {
    const data: HearingRecord = {
      hearingId: '550e8400-e29b-41d4-a716-446655440001',
      caseId: 'case-123',
      scheduledAt: '2026-02-20',
      hearingDate: '2026-03-05',
      attendees: ['Applicant', 'Agency Representative', 'Hearing Officer'],
      evidencePresented: ['Pay stubs showing $1,200/month', 'Bank statements'],
      findingsOfFact: ['Income was $1,200/month, not $2,400 as originally calculated'],
    };
    expect(HearingRecordSchema.parse(data)).toEqual(data);
  });

  it('requires at least one attendee', () => {
    expect(() => HearingRecordSchema.parse({
      hearingId: 'x', caseId: 'y', scheduledAt: '2026-01-01',
      hearingDate: '2026-01-15', attendees: [],
      evidencePresented: ['doc'], findingsOfFact: ['fact'],
    })).toThrow();
  });
});

describe('AppealDecisionSchema', () => {
  it('validates a favorable decision', () => {
    const data: AppealDecision = {
      decisionId: '550e8400-e29b-41d4-a716-446655440002',
      caseId: 'case-123',
      outcome: 'favorable',
      reasoning: 'Evidence shows agency miscalculated income. Applicant is eligible.',
      citedRegulations: ['7 CFR 273.15', '7 CFR 273.10'],
      orderText: 'Agency shall approve application and issue retroactive benefits.',
      implementationDeadline: '2026-03-15',
    };
    expect(AppealDecisionSchema.parse(data)).toEqual(data);
  });

  it('validates an unfavorable decision', () => {
    const result = AppealDecisionSchema.parse({
      decisionId: 'x', caseId: 'y', outcome: 'unfavorable',
      reasoning: 'Denial was correct.', citedRegulations: ['7 CFR 273.10'],
      orderText: 'Denial upheld.', implementationDeadline: '2026-04-01',
    });
    expect(result.outcome).toBe('unfavorable');
  });

  it('validates a remand decision', () => {
    const result = AppealDecisionSchema.parse({
      decisionId: 'x', caseId: 'y', outcome: 'remand',
      reasoning: 'Insufficient evidence. Case needs recalculation.',
      citedRegulations: ['7 CFR 273.15'],
      orderText: 'Case remanded for redetermination.',
      implementationDeadline: '2026-04-01',
    });
    expect(result.outcome).toBe('remand');
  });

  it('rejects invalid outcome', () => {
    expect(() => AppealDecisionSchema.parse({
      decisionId: 'x', caseId: 'y', outcome: 'partial',
      reasoning: 'r', citedRegulations: ['r'],
      orderText: 'o', implementationDeadline: '2026-01-01',
    })).toThrow();
  });

  it('rejects empty citedRegulations', () => {
    expect(() => AppealDecisionSchema.parse({
      decisionId: 'x', caseId: 'y', outcome: 'favorable',
      reasoning: 'r', citedRegulations: [],
      orderText: 'o', implementationDeadline: '2026-01-01',
    })).toThrow();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/casework-core/appeal-artifacts.test.ts`
Expected: FAIL -- module not found.

**Step 3: Create the Zod schemas**

Create `src/casework-core/artifacts/appeal-artifacts.ts`:

```typescript
import { z } from 'zod';

// ── Appeal Request ──────────────────────────────────────────────────────────

export const AppealRequestSchema = z.object({
  appealId: z.string().min(1),
  caseId: z.string().min(1),
  filedAt: z.string().min(1),
  reason: z.string().min(1),
  citedErrors: z.array(z.string()),
  requestedRelief: z.string().min(1),
});

export type AppealRequest = z.infer<typeof AppealRequestSchema>;

// ── Hearing Record ──────────────────────────────────────────────────────────

export const HearingRecordSchema = z.object({
  hearingId: z.string().min(1),
  caseId: z.string().min(1),
  scheduledAt: z.string().min(1),
  hearingDate: z.string().min(1),
  attendees: z.array(z.string()).min(1),
  evidencePresented: z.array(z.string()),
  findingsOfFact: z.array(z.string()),
});

export type HearingRecord = z.infer<typeof HearingRecordSchema>;

// ── Appeal Decision ─────────────────────────────────────────────────────────

export const AppealDecisionSchema = z.object({
  decisionId: z.string().min(1),
  caseId: z.string().min(1),
  outcome: z.enum(['favorable', 'unfavorable', 'remand']),
  reasoning: z.string().min(1),
  citedRegulations: z.array(z.string()).min(1),
  orderText: z.string().min(1),
  implementationDeadline: z.string().min(1),
});

export type AppealDecision = z.infer<typeof AppealDecisionSchema>;
```

**Step 4: Run tests**

Run: `npx vitest run tests/casework-core/appeal-artifacts.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/casework-core/artifacts/appeal-artifacts.ts tests/casework-core/appeal-artifacts.test.ts
git commit -m "feat(m4): add Zod schemas for appeal artifacts (request, hearing, decision)"
```

---

### Task 4: Appeal Reversal Scenario Generator

**Files:**
- Create: `src/casework-core/scenarios/appeal-reversal.ts`
- Test: `tests/casework-core/scenarios/appeal-reversal.test.ts`

**Step 1: Write the failing tests**

Create `tests/casework-core/scenarios/appeal-reversal.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  generateAppealReversalCases,
  type AppealReversalCase,
  type AppealReversalVariant,
} from '@core/scenarios/appeal-reversal';

const VALID_VARIANTS: AppealReversalVariant[] = [
  'favorable_reversal',
  'unfavorable_upheld',
  'remand_reopened',
];

describe('generateAppealReversalCases', () => {
  it('generates the requested number of cases', () => {
    const cases = generateAppealReversalCases(50, 42);
    expect(cases).toHaveLength(50);
  });

  it('is deterministic with the same seed', () => {
    const a = generateAppealReversalCases(30, 123);
    const b = generateAppealReversalCases(30, 123);
    expect(a).toEqual(b);
  });

  it('produces different results with different seeds', () => {
    const a = generateAppealReversalCases(20, 111);
    const b = generateAppealReversalCases(20, 222);
    const identical = a.every(
      (c, i) => c.applicantName === b[i].applicantName && c.variant === b[i].variant,
    );
    expect(identical).toBe(false);
  });

  it('each case has all required fields', () => {
    const cases = generateAppealReversalCases(50, 999);
    for (const c of cases) {
      expect(c.applicantName).toMatch(/^\S+ \S+$/);
      expect(c.householdSize).toBeGreaterThanOrEqual(1);
      expect(c.householdSize).toBeLessThanOrEqual(6);
      expect(VALID_VARIANTS).toContain(c.variant);
      expect(c.denialReason).toBeTruthy();
      expect(c.appealReason).toBeTruthy();
      expect(c.oracleInput).toBeDefined();
      expect(c.oracleInput!.householdSize).toBe(c.householdSize);
    }
  });

  it('variant distribution is roughly correct for 100 cases', () => {
    const cases = generateAppealReversalCases(100, 7777);
    const counts: Record<AppealReversalVariant, number> = {
      favorable_reversal: 0,
      unfavorable_upheld: 0,
      remand_reopened: 0,
    };
    for (const c of cases) counts[c.variant]++;

    // favorable ~50%, unfavorable ~30%, remand ~20%
    expect(counts.favorable_reversal).toBeGreaterThan(30);
    expect(counts.favorable_reversal).toBeLessThan(70);
    expect(counts.unfavorable_upheld).toBeGreaterThan(15);
    expect(counts.remand_reopened).toBeGreaterThan(8);
  });

  it('caseIndex is sequential starting at 0', () => {
    const cases = generateAppealReversalCases(30, 456);
    for (let i = 0; i < cases.length; i++) {
      expect(cases[i].caseIndex).toBe(i);
    }
  });

  it('every case has valid oracleInput', () => {
    const cases = generateAppealReversalCases(50, 42);
    for (const c of cases) {
      const oi = c.oracleInput!;
      expect(oi.householdMembers).toHaveLength(c.householdSize);
      expect(oi.income.length).toBeGreaterThanOrEqual(0);
      expect(oi.shelterCosts.suaTier).toBeDefined();
      expect(oi.applicationDate).toBe('2026-01-15');
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/casework-core/scenarios/appeal-reversal.test.ts`
Expected: FAIL -- module not found.

**Step 3: Create the scenario generator**

Create `src/casework-core/scenarios/appeal-reversal.ts`:

```typescript
// ---------------------------------------------------------------------------
// Seeded scenario generator: appeal-reversal
// ---------------------------------------------------------------------------

import type { OracleInput, HouseholdMember, IncomeItem, ShelterCosts, SuaTier } from '../oracle';

export type AppealReversalVariant =
  | 'favorable_reversal'
  | 'unfavorable_upheld'
  | 'remand_reopened';

export interface AppealReversalCase {
  caseIndex: number;
  applicantName: string;
  householdSize: number;
  variant: AppealReversalVariant;
  denialReason: string;
  appealReason: string;
  oracleInput?: OracleInput;
}

// ---------------------------------------------------------------------------
// Seeded PRNG -- mulberry32
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Maria', 'James', 'Patricia', 'Robert', 'Linda',
  'Michael', 'Barbara', 'William', 'Elizabeth', 'David',
  'Jennifer', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel',
] as const;

const LAST_NAMES = [
  'Garcia', 'Smith', 'Johnson', 'Williams', 'Brown',
  'Jones', 'Davis', 'Martinez', 'Rodriguez', 'Wilson',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
  'Martin', 'Lee', 'Perez', 'Thompson', 'White',
] as const;

const DENIAL_REASONS = [
  'Gross income exceeds 130% FPL limit',
  'Countable resources exceed $2,250 limit',
  'Net income exceeds 100% FPL limit',
  'Failed to provide required verification within deadline',
] as const;

const APPEAL_REASONS = [
  'Income was calculated incorrectly; pay stubs show lower amount',
  'Resource valuation included exempt vehicle',
  'Agency failed to apply standard deduction correctly',
  'Verification was submitted but not recorded by agency',
] as const;

const SUA_TIERS: SuaTier[] = [
  'heatingCooling',
  'limitedUtility',
  'singleUtility',
  'telephoneOnly',
  'none',
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickVariant(rand: () => number): AppealReversalVariant {
  const r = rand();
  if (r < 0.50) return 'favorable_reversal';
  if (r < 0.80) return 'unfavorable_upheld';
  return 'remand_reopened';
}

// ---------------------------------------------------------------------------
// Financial data generator (tuned per variant)
// ---------------------------------------------------------------------------

function generateOracleInput(
  householdSize: number,
  variant: AppealReversalVariant,
  rand: () => number,
): OracleInput {
  const householdMembers: HouseholdMember[] = [];
  for (let i = 0; i < householdSize; i++) {
    const age = i === 0
      ? Math.floor(rand() * 50) + 18
      : Math.floor(rand() * 80) + 1;
    const isDisabled = rand() < 0.08;
    const isStudent = age >= 18 && age <= 24 && rand() < 0.15;
    householdMembers.push({
      age,
      isDisabled,
      isStudent,
      citizenshipStatus: 'citizen',
    });
  }

  const income: IncomeItem[] = [];

  // For favorable_reversal and remand: generate income that keeps household eligible
  // For unfavorable_upheld: generate income that makes household clearly ineligible
  if (variant === 'unfavorable_upheld') {
    // High income -- clearly ineligible
    const amount = Math.floor(rand() * 2001) + 3000; // $3000-5000/mo
    income.push({
      type: 'earned',
      amount,
      frequency: 'monthly',
      source: 'employment',
      verified: true,
    });
  } else {
    // Low-to-moderate income -- should be eligible
    const amount = Math.floor(rand() * 1201) + 400; // $400-1600/mo
    income.push({
      type: 'earned',
      amount,
      frequency: 'monthly',
      source: 'employment',
      verified: true,
    });
  }

  // Some unearned income
  if (rand() < 0.25) {
    income.push({
      type: 'unearned',
      amount: Math.floor(rand() * 601) + 100,
      frequency: 'monthly',
      source: 'benefits',
      verified: true,
    });
  }

  const resources: { type: string; value: number; countable: boolean }[] = [];
  if (rand() < 0.25) {
    resources.push({
      type: 'savings',
      value: Math.floor(rand() * 3001),
      countable: true,
    });
  }

  const suaTier = pick(SUA_TIERS, rand);
  const shelterCosts: ShelterCosts = { suaTier };
  if (rand() < 0.75) {
    shelterCosts.rent = Math.floor(rand() * 1201) + 400;
  }

  const hasElderlyOrDisabled = householdMembers.some(
    (m) => m.age >= 60 || m.isDisabled,
  );

  let medicalExpenses: number | undefined;
  if (hasElderlyOrDisabled && rand() < 0.4) {
    medicalExpenses = Math.floor(rand() * 301) + 35;
  }

  const hasChildrenUnder13 = householdMembers.some((m) => m.age < 13);
  let dependentCareCosts: number | undefined;
  if (hasChildrenUnder13 && rand() < 0.3) {
    dependentCareCosts = Math.floor(rand() * 501) + 50;
  }

  let childSupportPaid: number | undefined;
  if (rand() < 0.1) {
    childSupportPaid = Math.floor(rand() * 401) + 50;
  }

  return {
    householdSize,
    householdMembers,
    income,
    resources,
    shelterCosts,
    medicalExpenses,
    dependentCareCosts,
    childSupportPaid,
    applicationDate: '2026-01-15',
    policyPackId: 'snap-illinois-fy2026-v1',
  };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateAppealReversalCases(
  count: number,
  seed: number,
): AppealReversalCase[] {
  const rand = mulberry32(seed);
  const cases: AppealReversalCase[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES, rand);
    const lastName = pick(LAST_NAMES, rand);
    const householdSize = Math.floor(rand() * 6) + 1;
    const variant = pickVariant(rand);

    cases.push({
      caseIndex: i,
      applicantName: `${firstName} ${lastName}`,
      householdSize,
      variant,
      denialReason: pick(DENIAL_REASONS, rand),
      appealReason: pick(APPEAL_REASONS, rand),
      oracleInput: generateOracleInput(householdSize, variant, rand),
    });
  }

  return cases;
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/casework-core/scenarios/appeal-reversal.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/casework-core/scenarios/appeal-reversal.ts tests/casework-core/scenarios/appeal-reversal.test.ts
git commit -m "feat(m4): add appeal reversal scenario generator with 3 variants"
```

---

### Task 5: Appeal Runner

**Files:**
- Modify: `src/casework-core/runner.ts`
- Test: `tests/casework-core/runner.test.ts`

**Step 1: Write the failing tests**

Add to `tests/casework-core/runner.test.ts` -- a new `describe('runAppealReversalScenario', ...)`:

```typescript
import { generateAppealReversalCases } from '@core/scenarios/appeal-reversal';
import { runAppealReversalScenario } from '@core/runner';

// ... (keep existing imports and tests) ...

describe('runAppealReversalScenario', () => {
  const SEED = 42;

  function runAppealN(count: number) {
    const cases = generateAppealReversalCases(count, SEED);
    return runAppealReversalScenario(cases);
  }

  it('runs 10 cases and returns a RunResult with no errors', () => {
    const result = runAppealN(10);
    expect(result.totalCases).toBe(10);
    expect(result.caseResults).toHaveLength(10);
    expect(result.errors).toHaveLength(0);
  });

  it('each case reaches CLOSED as finalState', () => {
    const result = runAppealN(20);
    for (const cr of result.caseResults) {
      expect(cr.finalState).toBe('CLOSED');
    }
  });

  it('favorable_reversal cases transition through full appeal path to approved', () => {
    const result = runAppealN(50);
    const favorable = result.caseResults.filter(c => c.variant === 'favorable_reversal');
    expect(favorable.length).toBeGreaterThan(0);
    for (const cr of favorable) {
      expect(cr.outcome).toBe('approved');
      const actions = cr.events.map(e => e.action);
      expect(actions).toContain('appeal_filed');
      expect(actions).toContain('schedule_hearing');
      expect(actions).toContain('render_decision');
      expect(actions).toContain('implement_favorable');
    }
  });

  it('unfavorable_upheld cases end denied', () => {
    const result = runAppealN(50);
    const unfavorable = result.caseResults.filter(c => c.variant === 'unfavorable_upheld');
    expect(unfavorable.length).toBeGreaterThan(0);
    for (const cr of unfavorable) {
      expect(cr.outcome).toBe('denied');
    }
  });

  it('remand_reopened cases end approved after reopening', () => {
    const result = runAppealN(50);
    const remand = result.caseResults.filter(c => c.variant === 'remand_reopened');
    expect(remand.length).toBeGreaterThan(0);
    for (const cr of remand) {
      expect(cr.outcome).toBe('approved');
      const actions = cr.events.map(e => e.action);
      expect(actions).toContain('reopen_case');
      // After reopen: approve -> send_notice -> implement -> close
      expect(actions).toContain('approve');
    }
  });

  it('all events have non-empty citations', () => {
    const result = runAppealN(20);
    for (const cr of result.caseResults) {
      for (const ev of cr.events) {
        expect(ev.citations.length).toBeGreaterThan(0);
      }
    }
  });

  it('100 cases complete without errors', () => {
    const result = runAppealN(100);
    expect(result.errors).toHaveLength(0);
    expect(result.caseResults).toHaveLength(100);
  });

  it('appeal cases have oracleOutput for non-abandoned cases', () => {
    const result = runAppealN(30);
    for (const cr of result.caseResults) {
      expect(cr.oracleOutput).toBeDefined();
      expect(cr.oracleComparison).toBeDefined();
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/casework-core/runner.test.ts`
Expected: FAIL -- `runAppealReversalScenario` not exported from runner.

**Step 3: Implement the appeal runner**

In `src/casework-core/runner.ts`, add imports and the new runner function. The key changes:

1. Add import for the appeal scenario type:
```typescript
import type { AppealReversalCase, AppealReversalVariant } from './scenarios/appeal-reversal';
```

2. Add appeal-specific citation map entries (add to `ACTION_CITATIONS`):
```typescript
const ACTION_CITATIONS: Record<string, string[]> = {
  // ... existing entries ...
  appeal_filed: ['CFR-273-15', 'SLA-APP-001'],
  schedule_hearing: ['CFR-273-15', 'SLA-APP-002'],
  render_decision: ['CFR-273-15'],
  implement_favorable: ['CFR-273-15', 'SLA-APP-004'],
  implement_unfavorable: ['CFR-273-15'],
  reopen_case: ['CFR-273-15'],
};
```

3. Add appeal step builder function:
```typescript
interface AppealStepDef {
  dayOffset: number;
  action: CaseAction;
  role: Role;
  agentId: string;
  preMutate?: (caseData: CaseData) => void;
}

function buildAppealSteps(variant: AppealReversalVariant): AppealStepDef[] {
  // Phase 1: Initial denial path (common to all variants)
  const denialPath: AppealStepDef[] = [
    { dayOffset: 1, action: 'request_verification', role: 'intake_clerk', agentId: 'clerk-1' },
    {
      dayOffset: 5,
      action: 'receive_verification',
      role: 'intake_clerk',
      agentId: 'clerk-1',
      preMutate: (cd) => {
        cd.verifiedItems = [...cd.requiredVerifications];
        cd.missingItems = [];
      },
    },
    { dayOffset: 5, action: 'verification_complete', role: 'caseworker', agentId: 'worker-1' },
    {
      dayOffset: 7,
      action: 'deny',
      role: 'caseworker',
      agentId: 'worker-1',
      preMutate: (cd) => { cd.determinationResult = 'denied'; },
    },
    {
      dayOffset: 9,
      action: 'send_notice',
      role: 'caseworker',
      agentId: 'worker-1',
      preMutate: (cd) => { cd.noticeSentAt = new Date('2026-01-10'); },
    },
  ];

  // Phase 2: Appeal path (varies by variant)
  switch (variant) {
    case 'favorable_reversal':
      return [
        ...denialPath,
        {
          dayOffset: 24,
          action: 'appeal_filed',
          role: 'system',
          agentId: 'system',
          preMutate: (cd) => { cd.appealFiledAt = new Date('2026-01-25'); },
        },
        {
          dayOffset: 27,
          action: 'schedule_hearing',
          role: 'supervisor',
          agentId: 'super-1',
          preMutate: (cd) => {
            cd.hearingScheduledAt = new Date('2026-01-28');
            cd.hearingDate = new Date('2026-02-10');
          },
        },
        {
          dayOffset: 42,
          action: 'render_decision',
          role: 'hearing_officer',
          agentId: 'ho-1',
          preMutate: (cd) => { cd.appealDecision = 'favorable'; },
        },
        { dayOffset: 47, action: 'implement_favorable', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 48, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];

    case 'unfavorable_upheld':
      return [
        ...denialPath,
        {
          dayOffset: 29,
          action: 'appeal_filed',
          role: 'system',
          agentId: 'system',
          preMutate: (cd) => { cd.appealFiledAt = new Date('2026-01-30'); },
        },
        {
          dayOffset: 33,
          action: 'schedule_hearing',
          role: 'supervisor',
          agentId: 'super-1',
          preMutate: (cd) => {
            cd.hearingScheduledAt = new Date('2026-02-03');
            cd.hearingDate = new Date('2026-02-18');
          },
        },
        {
          dayOffset: 52,
          action: 'render_decision',
          role: 'hearing_officer',
          agentId: 'ho-1',
          preMutate: (cd) => { cd.appealDecision = 'unfavorable'; },
        },
        { dayOffset: 57, action: 'implement_unfavorable', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 58, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];

    case 'remand_reopened':
      return [
        ...denialPath,
        {
          dayOffset: 19,
          action: 'appeal_filed',
          role: 'system',
          agentId: 'system',
          preMutate: (cd) => { cd.appealFiledAt = new Date('2026-01-20'); },
        },
        {
          dayOffset: 22,
          action: 'schedule_hearing',
          role: 'supervisor',
          agentId: 'super-1',
          preMutate: (cd) => {
            cd.hearingScheduledAt = new Date('2026-01-23');
            cd.hearingDate = new Date('2026-02-05');
          },
        },
        {
          dayOffset: 39,
          action: 'render_decision',
          role: 'hearing_officer',
          agentId: 'ho-1',
          preMutate: (cd) => { cd.appealDecision = 'remand'; },
        },
        { dayOffset: 40, action: 'reopen_case', role: 'supervisor', agentId: 'super-1' },
        // After reopen: re-determine, this time approve
        {
          dayOffset: 44,
          action: 'approve',
          role: 'caseworker',
          agentId: 'worker-1',
          preMutate: (cd) => { cd.determinationResult = 'approved'; },
        },
        { dayOffset: 46, action: 'send_notice', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 50, action: 'implement', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 51, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];
  }
}
```

4. Add the appeal outcome helper:
```typescript
function outcomeForAppealVariant(variant: AppealReversalVariant): 'approved' | 'denied' | 'abandoned' {
  switch (variant) {
    case 'favorable_reversal':
    case 'remand_reopened':
      return 'approved';
    case 'unfavorable_upheld':
      return 'denied';
  }
}
```

5. Add `runSingleAppealCase` function (follows same pattern as `runSingleCase` but uses `AppealReversalCase` and `buildAppealSteps`):

```typescript
function runSingleAppealCase(caseConfig: AppealReversalCase): CaseResult {
  const caseId = randomUUID();
  const applicationDate = new Date('2026-01-01');

  const caseData: CaseData = {
    applicantName: caseConfig.applicantName,
    householdSize: caseConfig.householdSize,
    requiredVerifications: ['identity', 'income', 'residency'],
    verifiedItems: [],
    missingItems: ['identity', 'income', 'residency'],
    applicationFiledAt: applicationDate,
    originalDenialReason: caseConfig.denialReason,
    appealReason: caseConfig.appealReason,
  };

  const policyPack = {
    sla: {} as Record<string, unknown>,
    ruleIndex: buildRuleIndex(),
  };

  const events: RunEvent[] = [];
  let currentState: CaseStatus = 'RECEIVED';
  const steps = buildAppealSteps(caseConfig.variant);
  let determinationDate: Date | null = null;

  for (const step of steps) {
    const timestamp = addDays(applicationDate, step.dayOffset);

    if (step.preMutate) {
      step.preMutate(caseData);
    }

    if (step.action === 'request_verification') {
      caseData.verificationRequestedAt = timestamp;
    }

    const ctx: TransitionContext = {
      caseId,
      currentState,
      actor: { role: step.role, agentId: step.agentId },
      timestamp,
      caseData: { ...caseData },
      policyPack,
    };

    const result = transition(currentState, step.action, ctx);

    if (!result.ok) {
      throw new Error(
        `Transition failed for appeal case ${caseConfig.caseIndex} ` +
        `(variant=${caseConfig.variant}): ${step.action} ` +
        `in state ${currentState}: ${result.error}`,
      );
    }

    const fromState = currentState;
    currentState = result.newState;
    const citations = ACTION_CITATIONS[step.action] ?? [];

    events.push({
      eventId: randomUUID(),
      action: step.action,
      actor: step.agentId,
      role: step.role,
      fromState,
      toState: currentState,
      timestamp,
      citations,
      guardResults: result.guardResults.map((gr) => ({
        guardName: gr.guardName,
        passed: gr.passed,
        detail: gr.reason,
      })),
    });

    if (
      step.action === 'approve' ||
      step.action === 'deny' ||
      step.action === 'implement_favorable' ||
      step.action === 'implement_unfavorable'
    ) {
      determinationDate = timestamp;
    }
  }

  const timeToDecisionDays =
    determinationDate !== null
      ? daysBetween(applicationDate, determinationDate)
      : null;

  // Oracle evaluation
  let oracleOutput: OracleOutput | undefined;
  let oracleComparison: OracleComparison | undefined;
  let mismatches: MismatchRecord[] | undefined;
  const outcome = outcomeForAppealVariant(caseConfig.variant);

  if (caseConfig.oracleInput) {
    const rules = loadRules();
    oracleOutput = computeEligibility(caseConfig.oracleInput, rules);

    const runnerCitations = events.flatMap(e => e.citations);
    const result = compareWithOracle(
      outcome === 'approved' ? 'approved' : 'denied',
      0,
      runnerCitations,
      oracleOutput,
    );
    oracleComparison = result.comparison;
    mismatches = result.mismatches;
  }

  return {
    caseId,
    variant: caseConfig.variant,
    applicantName: caseConfig.applicantName,
    finalState: currentState,
    outcome,
    events,
    slaBreaches: [],
    timeToDecisionDays,
    oracleOutput,
    oracleComparison,
    mismatches,
  };
}
```

6. Add the public entry point:

```typescript
export function runAppealReversalScenario(cases: AppealReversalCase[]): RunResult {
  const runId = randomUUID();
  const caseResults: CaseResult[] = [];
  const errors: { caseIndex: number; error: string }[] = [];

  for (const caseConfig of cases) {
    try {
      caseResults.push(runSingleAppealCase(caseConfig));
    } catch (err) {
      errors.push({
        caseIndex: caseConfig.caseIndex,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { runId, totalCases: cases.length, caseResults, errors };
}
```

**Step 4: Run tests**

Run: `npx vitest run tests/casework-core/runner.test.ts`
Expected: All existing + new runner tests PASS.

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/casework-core/runner.ts tests/casework-core/runner.test.ts
git commit -m "feat(m4): add appeal reversal runner with 3 variant step sequences"
```

---

### Task 6: Appeal Metrics

**Files:**
- Modify: `src/casework-core/metrics.ts`
- Test: `tests/casework-core/metrics.test.ts`

**Step 1: Write the failing tests**

Add to `tests/casework-core/metrics.test.ts`:

```typescript
import { generateAppealReversalCases } from '@core/scenarios/appeal-reversal';
import { runAppealReversalScenario } from '@core/runner';

// ... keep existing tests ...

describe('computeRunSummary for appeal-reversal', () => {
  it('computes appeal metrics for appeal scenario', () => {
    const cases = generateAppealReversalCases(50, 42);
    const result = runAppealReversalScenario(cases);
    const summary = computeRunSummary(result);

    expect(summary.appealMetrics).toBeDefined();
    expect(summary.appealMetrics!.casesAppealed).toBe(50);
    expect(summary.appealMetrics!.favorableRate).toBeGreaterThan(0);
    expect(summary.appealMetrics!.unfavorableRate).toBeGreaterThan(0);
    expect(summary.appealMetrics!.remandRate).toBeGreaterThan(0);
    expect(
      summary.appealMetrics!.favorableRate +
      summary.appealMetrics!.unfavorableRate +
      summary.appealMetrics!.remandRate
    ).toBeCloseTo(1, 5);
  });

  it('missing-docs scenario does not have appealMetrics', () => {
    const cases = generateMissingDocsCases(10, 42);
    const result = runMissingDocsScenario(cases);
    const summary = computeRunSummary(result);

    expect(summary.appealMetrics).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/casework-core/metrics.test.ts`
Expected: FAIL -- `appealMetrics` not on RunSummary.

**Step 3: Add appealMetrics to RunSummary and computeRunSummary**

In `src/casework-core/metrics.ts`:

Add to the `RunSummary` interface:

```typescript
appealMetrics?: {
  casesAppealed: number;
  favorableRate: number;
  unfavorableRate: number;
  remandRate: number;
  avgTimeToDecision: number;
};
```

In `computeRunSummary`, add after the oracle metrics block:

```typescript
// Appeal metrics (only if appeal variants present)
const appealVariants = ['favorable_reversal', 'unfavorable_upheld', 'remand_reopened'];
const appealCases = result.caseResults.filter(cr => appealVariants.includes(cr.variant));
let appealMetrics: RunSummary['appealMetrics'];

if (appealCases.length > 0) {
  const favorable = appealCases.filter(c => c.variant === 'favorable_reversal').length;
  const unfavorable = appealCases.filter(c => c.variant === 'unfavorable_upheld').length;
  const remand = appealCases.filter(c => c.variant === 'remand_reopened').length;
  const total = appealCases.length;

  let appealDecisionDays = 0;
  let appealDecidedCount = 0;
  for (const cr of appealCases) {
    if (cr.timeToDecisionDays !== null) {
      appealDecisionDays += cr.timeToDecisionDays;
      appealDecidedCount++;
    }
  }

  appealMetrics = {
    casesAppealed: total,
    favorableRate: favorable / total,
    unfavorableRate: unfavorable / total,
    remandRate: remand / total,
    avgTimeToDecision: appealDecidedCount > 0 ? appealDecisionDays / appealDecidedCount : 0,
  };
}
```

Add `appealMetrics` to the return object.

**Step 4: Run tests**

Run: `npx vitest run tests/casework-core/metrics.test.ts`
Expected: All tests PASS.

**Step 5: Commit**

```bash
git add src/casework-core/metrics.ts tests/casework-core/metrics.test.ts
git commit -m "feat(m4): add appeal metrics to RunSummary"
```

---

### Task 7: DB Schema for Appeal Artifacts

**Files:**
- Create: `src/db/schema/appeal-artifacts.ts`
- Modify: `src/db/schema/index.ts`

**Step 1: Create the appeal artifacts DB table**

Create `src/db/schema/appeal-artifacts.ts`:

```typescript
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { runs } from './runs';

export const appealArtifacts = pgTable('appeal_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  runnerCaseId: text('runner_case_id').notNull(),
  artifactType: text('artifact_type').notNull(), // 'appeal_request' | 'hearing_record' | 'appeal_decision'
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: Export from schema index**

In `src/db/schema/index.ts`, add:

```typescript
export { appealArtifacts } from './appeal-artifacts';
```

**Step 3: Push schema to DB**

Run: `npx drizzle-kit push`
Expected: The `appeal_artifacts` table is created in the database.

**Step 4: Commit**

```bash
git add src/db/schema/appeal-artifacts.ts src/db/schema/index.ts
git commit -m "feat(m4): add appeal_artifacts DB table"
```

---

### Task 8: API -- Handle appeal_reversal Scenario in Runs Route

**Files:**
- Modify: `src/casework-api/routes/runs.ts`

**Step 1: Update the runs route to handle appeal_reversal scenario**

In `src/casework-api/routes/runs.ts`, add imports:

```typescript
import { generateAppealReversalCases } from '@core/scenarios/appeal-reversal';
import { runAppealReversalScenario } from '@core/runner';
import { appealArtifacts } from '@db/schema/appeal-artifacts';
```

Replace the scenario execution block (lines 44-47) with a scenario switch:

```typescript
// --- Generate and run scenario ---
let result;
let summary;

if (scenario === 'missing_docs') {
  const cases = generateMissingDocsCases(count, seed);
  result = runMissingDocsScenario(cases);
} else if (scenario === 'appeal_reversal') {
  const cases = generateAppealReversalCases(count, seed);
  result = runAppealReversalScenario(cases);
} else {
  return res.status(400).json({ success: false, error: `Unknown scenario: ${scenario}` });
}

summary = computeRunSummary(result);
```

After the mismatch storage block, add appeal artifact storage:

```typescript
// --- Store appeal artifacts (placeholder data for now) ---
if (scenario === 'appeal_reversal') {
  const artifactRows: {
    runId: string;
    runnerCaseId: string;
    artifactType: string;
    data: unknown;
  }[] = [];

  for (const cr of result.caseResults) {
    // Generate artifact data from events
    const appealFiledEvent = cr.events.find(e => e.action === 'appeal_filed');
    const hearingEvent = cr.events.find(e => e.action === 'render_decision');
    const decisionEvent = cr.events.find(e => e.action === 'render_decision');

    if (appealFiledEvent) {
      artifactRows.push({
        runId: run.id,
        runnerCaseId: cr.caseId,
        artifactType: 'appeal_request',
        data: {
          appealId: cr.caseId + '-appeal',
          caseId: cr.caseId,
          filedAt: appealFiledEvent.timestamp,
          reason: cr.variant,
          citedErrors: [],
          requestedRelief: 'Reconsideration of denial',
        },
      });
    }

    if (decisionEvent) {
      artifactRows.push({
        runId: run.id,
        runnerCaseId: cr.caseId,
        artifactType: 'appeal_decision',
        data: {
          decisionId: cr.caseId + '-decision',
          caseId: cr.caseId,
          outcome: cr.variant === 'favorable_reversal' ? 'favorable'
            : cr.variant === 'unfavorable_upheld' ? 'unfavorable'
            : 'remand',
          reasoning: `Decision for ${cr.variant} case`,
          citedRegulations: ['7 CFR 273.15'],
          orderText: `Appeal ${cr.variant === 'favorable_reversal' ? 'granted' : cr.variant === 'unfavorable_upheld' ? 'denied' : 'remanded'}`,
          implementationDeadline: decisionEvent.timestamp,
        },
      });
    }
  }

  if (artifactRows.length > 0) {
    await db.insert(appealArtifacts).values(artifactRows);
  }
}
```

Add a new GET endpoint for appeal artifacts (before the `/:id` route):

```typescript
// GET /runs/:id/appeal-artifacts -- get appeal artifacts for a run
router.get('/:id/appeal-artifacts', async (req, res) => {
  const rows = await db
    .select()
    .from(appealArtifacts)
    .where(eq(appealArtifacts.runId, req.params.id));

  res.json({ success: true, data: rows });
});
```

**Step 2: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 3: Commit**

```bash
git add src/casework-api/routes/runs.ts
git commit -m "feat(m4): handle appeal_reversal scenario in runs API with artifact storage"
```

---

### Task 9: Shared Types + UI Updates

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/casework-ui/lib/api.ts`
- Modify: `src/casework-ui/components/RunScenarioForm.tsx`
- Modify: `src/casework-ui/components/RunSummaryCard.tsx`

**Step 1: Add appealMetrics to RunSummaryRecord**

In `src/shared/types.ts`, add to `RunSummaryRecord`:

```typescript
appealMetrics?: {
  casesAppealed: number;
  favorableRate: number;
  unfavorableRate: number;
  remandRate: number;
  avgTimeToDecision: number;
};
```

**Step 2: Add appeal API methods**

In `src/casework-ui/lib/api.ts`, add:

```typescript
getRunAppealArtifacts: (runId: string) =>
  request(`/runs/${runId}/appeal-artifacts`),
```

**Step 3: Update RunScenarioForm to support scenario selection**

Replace `src/casework-ui/components/RunScenarioForm.tsx` with:

```typescript
import { useState } from 'react';
import { api } from '@ui/lib/api';

interface Props {
  onComplete: (summary: any, data?: any) => void;
}

export function RunScenarioForm({ onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState('missing_docs');
  const [count, setCount] = useState(100);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    const res = await api.startRun(scenario, count);
    setRunning(false);
    if (res.success && res.data) {
      onComplete((res.data as any).summary, res.data);
      setOpen(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="px-3 py-1.5 bg-green-700 text-white text-sm rounded hover:bg-green-600">
        Run Scenario
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <select value={scenario} onChange={(e) => setScenario(e.target.value)}
        className="px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white">
        <option value="missing_docs">Missing Docs</option>
        <option value="appeal_reversal">Appeal Reversal</option>
      </select>
      <label className="text-sm text-gray-400">Cases:</label>
      <input type="number" value={count} onChange={(e) => setCount(Number(e.target.value))}
        min={1} max={1000} className="w-20 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-sm text-white" />
      <button onClick={handleRun} disabled={running}
        className="px-3 py-1.5 bg-green-700 text-white text-sm rounded hover:bg-green-600 disabled:opacity-50">
        {running ? 'Running...' : 'Start'}
      </button>
      <button onClick={() => setOpen(false)} className="px-3 py-1.5 bg-gray-700 text-white text-sm rounded hover:bg-gray-600">
        Cancel
      </button>
    </div>
  );
}
```

**Step 4: Update RunSummaryCard to show appeal metrics**

In `src/casework-ui/components/RunSummaryCard.tsx`, add `appealMetrics?` to the `RunSummaryData` interface:

```typescript
appealMetrics?: {
  casesAppealed: number;
  favorableRate: number;
  unfavorableRate: number;
  remandRate: number;
  avgTimeToDecision: number;
};
```

Change the heading from hardcoded "Missing Docs Scenario" to dynamic:

```typescript
<h3 className="text-sm font-medium text-gray-300 mb-3">
  Run Results{summary.appealMetrics ? ': Appeal Reversal' : ': Missing Docs'}
</h3>
```

Add an appeal metrics section after the oracle metrics block:

```typescript
{summary.appealMetrics && (
  <div className="mt-3 pt-3 border-t border-gray-700">
    <h4 className="text-xs font-medium text-gray-400 mb-2">Appeal Outcomes</h4>
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
      <div>
        <span className="text-gray-500">Cases Appealed:</span>{' '}
        <span className="text-white">{summary.appealMetrics.casesAppealed}</span>
      </div>
      <div>
        <span className="text-gray-500">Favorable:</span>{' '}
        <span className="text-green-400">
          {(summary.appealMetrics.favorableRate * 100).toFixed(0)}%
        </span>
      </div>
      <div>
        <span className="text-gray-500">Unfavorable:</span>{' '}
        <span className="text-red-400">
          {(summary.appealMetrics.unfavorableRate * 100).toFixed(0)}%
        </span>
      </div>
      <div>
        <span className="text-gray-500">Remand:</span>{' '}
        <span className="text-yellow-400">
          {(summary.appealMetrics.remandRate * 100).toFixed(0)}%
        </span>
      </div>
    </div>
  </div>
)}
```

**Step 5: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/shared/types.ts src/casework-ui/lib/api.ts src/casework-ui/components/RunScenarioForm.tsx src/casework-ui/components/RunSummaryCard.tsx
git commit -m "feat(m4): add appeal metrics to shared types and UI components"
```

---

### Task 10: E2E Verification

**Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass (should be ~200+ tests now).

**Step 2: Push DB schema**

Run: `npx drizzle-kit push`
Expected: All tables up to date.

**Step 3: Start dev server**

Run: `npm run dev`
Expected: API on :3001, UI on :5174.

**Step 4: Test the appeal_reversal scenario via API**

Run: `curl -s -X POST http://localhost:3001/api/runs -H 'Content-Type: application/json' -d '{"scenario":"appeal_reversal","count":50,"seed":42}' | jq '.data.summary.appealMetrics'`

Expected: JSON output showing casesAppealed, favorableRate, unfavorableRate, remandRate.

**Step 5: Test appeal artifacts endpoint**

Use the run ID from step 4:

Run: `curl -s http://localhost:3001/api/runs/<runId>/appeal-artifacts | jq '.data | length'`

Expected: Non-zero number of appeal artifacts.

**Step 6: Browser verification**

Navigate to `http://localhost:5174`:
1. Click "Run Scenario"
2. Select "Appeal Reversal" from dropdown
3. Set cases to 50, click "Start"
4. Verify Run Results card shows "Appeal Reversal" heading with appeal outcomes section
5. Verify Oracle Accuracy section shows data
6. Verify QA Mismatches section shows mismatches

**Step 7: Take screenshot**

Save to `docs/screenshots/m4-appeal-results.png`.

**Step 8: Commit**

```bash
git add docs/screenshots/m4-appeal-results.png
git commit -m "docs(m4): add E2E verification screenshot for appeal reversal scenario"
```

---

### Task 11: Push + PR

**Step 1: Create feature branch** (if not already on one)

```bash
git checkout -b feature/m4-appeals-lane
```

**Step 2: Push to remote**

```bash
git push -u origin feature/m4-appeals-lane
```

**Step 3: Create PR**

```bash
gh pr create --title "M4: Appeals Lane" --body "$(cat <<'EOF'
## Summary
- Added appeal lifecycle to state machine (APPEAL_HEARING_SCHEDULED state, 6 new actions, 4 guards)
- Created appeal reversal scenario generator with 3 variants (favorable, unfavorable, remand)
- Added Zod schemas for appeal artifacts (request, hearing record, decision)
- Added appeal runner with oracle integration
- Added appeal metrics to RunSummary
- Added appeal_artifacts DB table
- Updated API to handle appeal_reversal scenario
- Updated UI with scenario selector and appeal outcome display

## Test plan
- [ ] All vitest tests pass (200+ tests)
- [ ] Appeal reversal scenario runs 50+ cases without errors
- [ ] Appeal artifacts persisted to DB
- [ ] UI shows appeal outcomes and scenario selector
- [ ] Oracle comparison works for appeal cases

Generated with Claude Code
EOF
)"
```
