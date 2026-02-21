import { describe, it, expect } from 'vitest';
import { transition } from '@core/state-machine';
import type { TransitionContext, CaseData } from '@core/state-machine';

describe('transition API logic', () => {
  const baseCaseData: CaseData = {
    applicantName: 'Test',
    householdSize: 2,
    requiredVerifications: ['identity'],
    verifiedItems: [],
    missingItems: ['identity'],
    applicationFiledAt: new Date('2026-01-01'),
  };

  const makeCtx = (state: string, role: string): TransitionContext => ({
    caseId: 'test',
    currentState: state as TransitionContext['currentState'],
    actor: { role: role as TransitionContext['actor']['role'], agentId: 'test' },
    timestamp: new Date('2026-01-15'),
    caseData: baseCaseData,
    policyPack: { sla: {}, ruleIndex: new Set() },
  });

  it('intake_clerk can request_verification from RECEIVED', () => {
    const result = transition(
      'RECEIVED' as TransitionContext['currentState'],
      'request_verification' as Parameters<typeof transition>[1],
      makeCtx('RECEIVED', 'intake_clerk'),
    );
    expect(result.ok).toBe(true);
  });

  it('caseworker cannot request_verification', () => {
    const result = transition(
      'RECEIVED' as TransitionContext['currentState'],
      'request_verification' as Parameters<typeof transition>[1],
      makeCtx('RECEIVED', 'caseworker'),
    );
    expect(result.ok).toBe(false);
  });

  it('invalid transition returns error', () => {
    const result = transition(
      'RECEIVED' as TransitionContext['currentState'],
      'approve' as Parameters<typeof transition>[1],
      makeCtx('RECEIVED', 'caseworker'),
    );
    expect(result.ok).toBe(false);
  });
});
