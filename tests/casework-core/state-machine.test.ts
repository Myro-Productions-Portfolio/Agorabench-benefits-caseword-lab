import { describe, it, expect } from 'vitest';
import { CASE_STATUSES, CASE_ACTIONS, ROLES } from '@shared/constants';
import {
  ROLE_PERMISSIONS,
  TRANSITION_TABLE,
  GUARDS,
  guardVerificationComplete,
  guardSlaVerMinDays,
  checkGuards,
  transition,
  type CaseAction,
  type CaseStatus,
  type Role,
  type TransitionContext,
  type CaseData,
} from '@core/state-machine';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCaseData(overrides: Partial<CaseData> = {}): CaseData {
  return {
    applicantName: 'Jane Doe',
    householdSize: 3,
    requiredVerifications: ['income', 'identity'],
    verifiedItems: [],
    missingItems: ['income', 'identity'],
    applicationFiledAt: new Date('2026-01-01'),
    ...overrides,
  };
}

function makeCtx(overrides: Partial<TransitionContext> = {}): TransitionContext {
  return {
    caseId: 'case-001',
    currentState: 'RECEIVED',
    actor: { role: 'intake_clerk', agentId: 'agent-1' },
    timestamp: new Date('2026-01-15'),
    caseData: makeCaseData(),
    policyPack: {
      sla: {},
      ruleIndex: new Set(),
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Task 1 — Types and Transition Table
// ---------------------------------------------------------------------------

describe('ROLE_PERMISSIONS', () => {
  it('covers every CASE_ACTION', () => {
    for (const action of CASE_ACTIONS) {
      expect(ROLE_PERMISSIONS).toHaveProperty(action);
      expect(ROLE_PERMISSIONS[action].length).toBeGreaterThan(0);
    }
  });

  it('only references valid ROLES', () => {
    const validRoles = new Set<string>(ROLES);
    for (const action of CASE_ACTIONS) {
      for (const role of ROLE_PERMISSIONS[action]) {
        expect(validRoles.has(role)).toBe(true);
      }
    }
  });
});

describe('TRANSITION_TABLE', () => {
  const validStatuses = new Set<string>(CASE_STATUSES);
  const validActions = new Set<string>(CASE_ACTIONS);

  it('only uses valid CASE_STATUSES as source states', () => {
    for (const fromState of Object.keys(TRANSITION_TABLE)) {
      expect(validStatuses.has(fromState)).toBe(true);
    }
  });

  it('only uses valid CASE_ACTIONS as action keys', () => {
    for (const fromState of Object.keys(TRANSITION_TABLE)) {
      const transitions = TRANSITION_TABLE[fromState as CaseStatus]!;
      for (const action of Object.keys(transitions)) {
        expect(validActions.has(action)).toBe(true);
      }
    }
  });

  it('only uses valid CASE_STATUSES as target states', () => {
    for (const fromState of Object.keys(TRANSITION_TABLE)) {
      const transitions = TRANSITION_TABLE[fromState as CaseStatus]!;
      for (const targetState of Object.values(transitions)) {
        expect(validStatuses.has(targetState as string)).toBe(true);
      }
    }
  });

  it('includes CLOSED as a reachable target state', () => {
    const targets = new Set<string>();
    for (const fromState of Object.keys(TRANSITION_TABLE)) {
      const transitions = TRANSITION_TABLE[fromState as CaseStatus]!;
      for (const target of Object.values(transitions)) {
        targets.add(target as string);
      }
    }
    expect(targets.has('CLOSED')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Task 2 — Guard Functions
// ---------------------------------------------------------------------------

describe('guardVerificationComplete', () => {
  it('passes when all required items are verified', () => {
    const ctx = makeCtx({
      caseData: makeCaseData({
        requiredVerifications: ['income', 'identity'],
        verifiedItems: ['income', 'identity'],
      }),
    });
    const result = guardVerificationComplete(ctx);
    expect(result.passed).toBe(true);
    expect(result.guardName).toBe('guardVerificationComplete');
  });

  it('fails when items are still missing', () => {
    const ctx = makeCtx({
      caseData: makeCaseData({
        requiredVerifications: ['income', 'identity', 'residency'],
        verifiedItems: ['income'],
      }),
    });
    const result = guardVerificationComplete(ctx);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('identity');
    expect(result.reason).toContain('residency');
  });

  it('passes when there are no required verifications', () => {
    const ctx = makeCtx({
      caseData: makeCaseData({
        requiredVerifications: [],
        verifiedItems: [],
      }),
    });
    const result = guardVerificationComplete(ctx);
    expect(result.passed).toBe(true);
  });
});

describe('guardSlaVerMinDays', () => {
  it('blocks if fewer than 10 days since verification request', () => {
    const ctx = makeCtx({
      timestamp: new Date('2026-01-08'),
      caseData: makeCaseData({
        verificationRequestedAt: new Date('2026-01-01'),
      }),
    });
    const result = guardSlaVerMinDays(ctx);
    expect(result.passed).toBe(false);
    expect(result.citation).toBe('SLA-VER-001');
    expect(result.reason).toContain('7 of 10');
  });

  it('allows if exactly 10 days since verification request', () => {
    const ctx = makeCtx({
      timestamp: new Date('2026-01-11'),
      caseData: makeCaseData({
        verificationRequestedAt: new Date('2026-01-01'),
      }),
    });
    const result = guardSlaVerMinDays(ctx);
    expect(result.passed).toBe(true);
    expect(result.citation).toBe('SLA-VER-001');
  });

  it('allows if more than 10 days since verification request', () => {
    const ctx = makeCtx({
      timestamp: new Date('2026-01-20'),
      caseData: makeCaseData({
        verificationRequestedAt: new Date('2026-01-01'),
      }),
    });
    const result = guardSlaVerMinDays(ctx);
    expect(result.passed).toBe(true);
  });

  it('fails if verificationRequestedAt is not set', () => {
    const ctx = makeCtx({
      caseData: makeCaseData({
        verificationRequestedAt: undefined,
      }),
    });
    const result = guardSlaVerMinDays(ctx);
    expect(result.passed).toBe(false);
    expect(result.reason).toContain('No verification request date');
  });
});

describe('checkGuards', () => {
  it('returns results for verification_complete guards', () => {
    const ctx = makeCtx({
      caseData: makeCaseData({
        requiredVerifications: ['income'],
        verifiedItems: ['income'],
      }),
    });
    const results = checkGuards('verification_complete', ctx);
    expect(results).toHaveLength(1);
    expect(results[0].guardName).toBe('guardVerificationComplete');
    expect(results[0].passed).toBe(true);
  });

  it('returns empty array for actions with no guards', () => {
    const ctx = makeCtx();
    const results = checkGuards('request_verification', ctx);
    expect(results).toHaveLength(0);
  });

  it('GUARDS map covers every CASE_ACTION', () => {
    for (const action of CASE_ACTIONS) {
      expect(GUARDS).toHaveProperty(action);
      expect(Array.isArray(GUARDS[action])).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Task 3 — Transition Reducer
// ---------------------------------------------------------------------------

describe('transition()', () => {
  it('transitions RECEIVED -> PENDING_VERIFICATION via request_verification', () => {
    const ctx = makeCtx({
      currentState: 'RECEIVED',
      actor: { role: 'intake_clerk', agentId: 'agent-1' },
    });
    const result = transition('RECEIVED', 'request_verification', ctx);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newState).toBe('PENDING_VERIFICATION');
      expect(result.citations).toEqual([]);
    }
  });

  it('rejects an invalid transition (RECEIVED + approve)', () => {
    const ctx = makeCtx({
      currentState: 'RECEIVED',
      actor: { role: 'caseworker', agentId: 'agent-2' },
    });
    const result = transition('RECEIVED', 'approve', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not valid in state');
    }
  });

  it('rejects wrong role (caseworker cannot request_verification)', () => {
    const ctx = makeCtx({
      currentState: 'RECEIVED',
      actor: { role: 'caseworker', agentId: 'agent-2' },
    });
    const result = transition('RECEIVED', 'request_verification', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not permitted');
      expect(result.error).toContain('caseworker');
    }
  });

  it('rejects when guard fails (verification_complete with missing items)', () => {
    const ctx = makeCtx({
      currentState: 'PENDING_VERIFICATION',
      actor: { role: 'caseworker', agentId: 'agent-2' },
      caseData: makeCaseData({
        requiredVerifications: ['income', 'identity'],
        verifiedItems: ['income'],
      }),
    });
    const result = transition(
      'PENDING_VERIFICATION',
      'verification_complete',
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Guard(s) failed');
      expect(result.guardResults).toBeDefined();
      expect(result.guardResults!.some((g) => !g.passed)).toBe(true);
    }
  });

  it('rejects verification_refused if SLA not met (< 10 days)', () => {
    const ctx = makeCtx({
      currentState: 'PENDING_VERIFICATION',
      actor: { role: 'intake_clerk', agentId: 'agent-1' },
      timestamp: new Date('2026-01-05'),
      caseData: makeCaseData({
        verificationRequestedAt: new Date('2026-01-01'),
      }),
    });
    const result = transition(
      'PENDING_VERIFICATION',
      'verification_refused',
      ctx,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('Guard(s) failed');
    }
  });

  it('allows verification_refused if SLA is met (>= 10 days)', () => {
    const ctx = makeCtx({
      currentState: 'PENDING_VERIFICATION',
      actor: { role: 'intake_clerk', agentId: 'agent-1' },
      timestamp: new Date('2026-01-12'),
      caseData: makeCaseData({
        verificationRequestedAt: new Date('2026-01-01'),
      }),
    });
    const result = transition(
      'PENDING_VERIFICATION',
      'verification_refused',
      ctx,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.newState).toBe('DETERMINED_DENIED');
    }
  });

  it('rejects transition from a terminal state (CLOSED)', () => {
    const ctx = makeCtx({
      currentState: 'CLOSED',
      actor: { role: 'supervisor', agentId: 'agent-3' },
    });
    const result = transition('CLOSED', 'close_case', ctx);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('No transitions defined');
    }
  });

  describe('full happy path: RECEIVED through CLOSED', () => {
    it('completes 6 transitions from RECEIVED to CLOSED', () => {
      const caseData = makeCaseData({
        requiredVerifications: ['income', 'identity'],
        verifiedItems: [],
        verificationRequestedAt: undefined,
      });

      const policyPack = { sla: {}, ruleIndex: new Set<string>() };

      // 1) RECEIVED -> PENDING_VERIFICATION  (intake_clerk: request_verification)
      let ctx: TransitionContext = {
        caseId: 'case-happy',
        currentState: 'RECEIVED',
        actor: { role: 'intake_clerk', agentId: 'clerk-1' },
        timestamp: new Date('2026-01-01'),
        caseData: { ...caseData },
        policyPack,
      };

      let result = transition('RECEIVED', 'request_verification', ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.newState).toBe('PENDING_VERIFICATION');
      let currentState: CaseStatus = result.newState;

      // Simulate: verificationRequestedAt is now set, items received
      caseData.verificationRequestedAt = new Date('2026-01-01');
      caseData.verifiedItems = ['income', 'identity'];
      caseData.missingItems = [];

      // 2) PENDING_VERIFICATION -> READY_FOR_DETERMINATION  (caseworker: verification_complete)
      ctx = {
        ...ctx,
        currentState: currentState,
        actor: { role: 'caseworker', agentId: 'worker-1' },
        timestamp: new Date('2026-01-05'),
        caseData: { ...caseData },
      };

      result = transition(currentState, 'verification_complete', ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.newState).toBe('READY_FOR_DETERMINATION');
      currentState = result.newState;

      // 3) READY_FOR_DETERMINATION -> DETERMINED_APPROVED  (caseworker: approve)
      ctx = {
        ...ctx,
        currentState: currentState,
        timestamp: new Date('2026-01-06'),
        caseData: { ...caseData, determinationResult: 'approved' },
      };

      result = transition(currentState, 'approve', ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.newState).toBe('DETERMINED_APPROVED');
      currentState = result.newState;

      // 4) DETERMINED_APPROVED -> NOTICE_SENT  (caseworker: send_notice)
      ctx = {
        ...ctx,
        currentState: currentState,
        timestamp: new Date('2026-01-07'),
      };

      result = transition(currentState, 'send_notice', ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.newState).toBe('NOTICE_SENT');
      currentState = result.newState;

      // 5) NOTICE_SENT -> IMPLEMENTED  (supervisor: implement)
      ctx = {
        ...ctx,
        currentState: currentState,
        actor: { role: 'supervisor', agentId: 'super-1' },
        timestamp: new Date('2026-01-08'),
      };

      result = transition(currentState, 'implement', ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.newState).toBe('IMPLEMENTED');
      currentState = result.newState;

      // 6) IMPLEMENTED -> CLOSED  (supervisor: close_case)
      ctx = {
        ...ctx,
        currentState: currentState,
        timestamp: new Date('2026-01-09'),
      };

      result = transition(currentState, 'close_case', ctx);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.error);
      expect(result.newState).toBe('CLOSED');
    });
  });
});
