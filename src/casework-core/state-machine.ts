import { CASE_STATUSES, CASE_ACTIONS, ROLES } from '@shared/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type CaseAction = (typeof CASE_ACTIONS)[number];
export type Role = (typeof ROLES)[number];

export interface CaseData {
  applicantName: string;
  householdSize: number;
  requiredVerifications: string[];
  verifiedItems: string[];
  missingItems: string[];
  verificationRequestedAt?: Date;
  applicationFiledAt: Date;
  determinationResult?: 'approved' | 'denied';
}

export interface TransitionContext {
  caseId: string;
  currentState: CaseStatus;
  actor: {
    role: Role;
    agentId: string;
  };
  timestamp: Date;
  caseData: CaseData;
  policyPack: {
    sla: Record<string, unknown>;
    ruleIndex: Set<string>;
  };
}

export interface GuardResult {
  guardName: string;
  passed: boolean;
  reason?: string;
  citation?: string;
}

export interface TransitionSuccess {
  ok: true;
  newState: CaseStatus;
  guardResults: GuardResult[];
  citations: string[];
}

export interface TransitionFailure {
  ok: false;
  error: string;
  guardResults?: GuardResult[];
}

export type TransitionResult = TransitionSuccess | TransitionFailure;

// ---------------------------------------------------------------------------
// Role Permissions
// ---------------------------------------------------------------------------

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
};

// ---------------------------------------------------------------------------
// Transition Table  (missing-docs path)
// ---------------------------------------------------------------------------

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
  },
  IMPLEMENTED: {
    close_case: 'CLOSED',
  },
};

// ---------------------------------------------------------------------------
// Guard Functions
// ---------------------------------------------------------------------------

type GuardFn = (ctx: TransitionContext) => GuardResult;

/**
 * Checks that every required verification item has been received.
 */
export function guardVerificationComplete(ctx: TransitionContext): GuardResult {
  const { requiredVerifications, verifiedItems } = ctx.caseData;
  const missing = requiredVerifications.filter(
    (item) => !verifiedItems.includes(item),
  );

  if (missing.length === 0) {
    return { guardName: 'guardVerificationComplete', passed: true };
  }

  return {
    guardName: 'guardVerificationComplete',
    passed: false,
    reason: `Missing verified items: ${missing.join(', ')}`,
  };
}

/**
 * SLA-VER-001: At least 10 calendar days must have elapsed since
 * the verification was requested before a denial / refusal can proceed.
 */
export function guardSlaVerMinDays(ctx: TransitionContext): GuardResult {
  const { verificationRequestedAt } = ctx.caseData;

  if (!verificationRequestedAt) {
    return {
      guardName: 'guardSlaVerMinDays',
      passed: false,
      reason: 'No verification request date recorded',
      citation: 'SLA-VER-001',
    };
  }

  const elapsed = ctx.timestamp.getTime() - verificationRequestedAt.getTime();
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;

  if (elapsed >= tenDaysMs) {
    return {
      guardName: 'guardSlaVerMinDays',
      passed: true,
      citation: 'SLA-VER-001',
    };
  }

  return {
    guardName: 'guardSlaVerMinDays',
    passed: false,
    reason: `Only ${Math.floor(elapsed / (24 * 60 * 60 * 1000))} of 10 required days elapsed since verification request`,
    citation: 'SLA-VER-001',
  };
}

/**
 * Map of action -> guard functions that must ALL pass.
 */
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
};

/**
 * Run all guard functions registered for an action.
 */
export function checkGuards(
  action: CaseAction,
  ctx: TransitionContext,
): GuardResult[] {
  const fns = GUARDS[action];
  return fns.map((fn) => fn(ctx));
}

// ---------------------------------------------------------------------------
// Transition Reducer
// ---------------------------------------------------------------------------

/**
 * Pure reducer: given (currentState, action, context), returns either a
 * successful transition with the new state, or an error explaining the
 * rejection.
 */
export function transition(
  currentState: CaseStatus,
  action: CaseAction,
  ctx: TransitionContext,
): TransitionResult {
  // 1. Role permission check
  const allowedRoles = ROLE_PERMISSIONS[action];
  if (!allowedRoles.includes(ctx.actor.role)) {
    return {
      ok: false,
      error: `Role '${ctx.actor.role}' is not permitted to perform '${action}'`,
    };
  }

  // 2. Transition table check
  const stateTransitions = TRANSITION_TABLE[currentState];
  if (!stateTransitions) {
    return {
      ok: false,
      error: `No transitions defined from state '${currentState}'`,
    };
  }

  const newState = stateTransitions[action];
  if (!newState) {
    return {
      ok: false,
      error: `Action '${action}' is not valid in state '${currentState}'`,
    };
  }

  // 3. Guard evaluation
  const guardResults = checkGuards(action, ctx);
  const failed = guardResults.filter((g) => !g.passed);

  if (failed.length > 0) {
    return {
      ok: false,
      error: `Guard(s) failed: ${failed.map((g) => g.guardName).join(', ')}`,
      guardResults,
    };
  }

  // 4. Success
  return {
    ok: true,
    newState,
    guardResults,
    citations: [],
  };
}
