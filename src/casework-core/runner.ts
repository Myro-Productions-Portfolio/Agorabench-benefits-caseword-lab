import { randomUUID } from 'crypto';
import { transition } from './state-machine';
import type {
  TransitionContext,
  CaseData,
  Role,
  CaseAction,
  CaseStatus,
} from './state-machine';
import type { MissingDocsCase, MissingDocsVariant } from './scenarios/missing-docs';

// ---------------------------------------------------------------------------
// Public interfaces
// ---------------------------------------------------------------------------

export interface RunEvent {
  eventId: string;
  action: string;
  actor: string;
  role: string;
  fromState: CaseStatus;
  toState: CaseStatus;
  timestamp: Date;
  citations: string[];
  guardResults: { guardName: string; passed: boolean; detail?: string }[];
}

export interface CaseResult {
  caseId: string;
  variant: string;
  applicantName: string;
  finalState: CaseStatus;
  outcome: 'approved' | 'denied' | 'abandoned';
  events: RunEvent[];
  slaBreaches: string[];
  timeToDecisionDays: number | null;
}

export interface RunResult {
  runId: string;
  totalCases: number;
  caseResults: CaseResult[];
  errors: { caseIndex: number; error: string }[];
}

// ---------------------------------------------------------------------------
// Citation map
// ---------------------------------------------------------------------------

const ACTION_CITATIONS: Record<string, string[]> = {
  request_verification: ['VER-MAND-001', 'NOT-VER-001'],
  receive_verification: ['VER-MAND-001'],
  verification_complete: ['VER-MAND-001'],
  verification_refused: ['VER-MAND-001'],
  approve: ['ELIG-GROSS-001'],
  deny: ['ELIG-GROSS-001'],
  send_notice: ['NOT-APPR-001'],
  implement: ['CFR-273'],
  close_case: ['CFR-273'],
  close_abandoned: ['CFR-273'],
};

// ---------------------------------------------------------------------------
// Variant-specific step sequences
// ---------------------------------------------------------------------------

interface StepDef {
  dayOffset: number;
  action: CaseAction;
  role: Role;
  agentId: string;
  /** Mutate caseData before the transition fires. */
  preMutate?: (caseData: CaseData) => void;
}

function buildSteps(
  variant: MissingDocsVariant,
  requiredVerifications: string[],
): StepDef[] {
  switch (variant) {
    case 'docs_arrive_on_time':
      return [
        { dayOffset: 1, action: 'request_verification', role: 'intake_clerk', agentId: 'clerk-1' },
        {
          dayOffset: 8,
          action: 'receive_verification',
          role: 'intake_clerk',
          agentId: 'clerk-1',
          preMutate: (cd) => {
            cd.verifiedItems = [...requiredVerifications];
            cd.missingItems = [];
          },
        },
        { dayOffset: 8, action: 'verification_complete', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 10, action: 'approve', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 12, action: 'send_notice', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 15, action: 'implement', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 16, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];

    case 'docs_arrive_late':
      return [
        { dayOffset: 1, action: 'request_verification', role: 'intake_clerk', agentId: 'clerk-1' },
        {
          dayOffset: 35,
          action: 'receive_verification',
          role: 'intake_clerk',
          agentId: 'clerk-1',
          preMutate: (cd) => {
            cd.verifiedItems = [...requiredVerifications];
            cd.missingItems = [];
          },
        },
        { dayOffset: 35, action: 'verification_complete', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 37, action: 'approve', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 39, action: 'send_notice', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 42, action: 'implement', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 43, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];

    case 'docs_never_arrive':
      return [
        { dayOffset: 1, action: 'request_verification', role: 'intake_clerk', agentId: 'clerk-1' },
        { dayOffset: 62, action: 'close_abandoned', role: 'system', agentId: 'system' },
      ];

    case 'applicant_refuses':
      return [
        { dayOffset: 1, action: 'request_verification', role: 'intake_clerk', agentId: 'clerk-1' },
        { dayOffset: 12, action: 'verification_refused', role: 'intake_clerk', agentId: 'clerk-1' },
        { dayOffset: 14, action: 'send_notice', role: 'caseworker', agentId: 'worker-1' },
        { dayOffset: 17, action: 'implement', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 18, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];
  }
}

// ---------------------------------------------------------------------------
// Outcome + SLA helpers
// ---------------------------------------------------------------------------

function outcomeForVariant(variant: MissingDocsVariant): 'approved' | 'denied' | 'abandoned' {
  switch (variant) {
    case 'docs_arrive_on_time':
    case 'docs_arrive_late':
      return 'approved';
    case 'applicant_refuses':
      return 'denied';
    case 'docs_never_arrive':
      return 'abandoned';
  }
}

function slaBreachesForVariant(variant: MissingDocsVariant): string[] {
  switch (variant) {
    case 'docs_arrive_late':
    case 'docs_never_arrive':
      return ['SLA-PROC-001'];
    default:
      return [];
  }
}

// ---------------------------------------------------------------------------
// Date arithmetic
// ---------------------------------------------------------------------------

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
}

// ---------------------------------------------------------------------------
// Build the ruleIndex set from all citations referenced
// ---------------------------------------------------------------------------

function buildRuleIndex(): Set<string> {
  const ids = new Set<string>();
  for (const cites of Object.values(ACTION_CITATIONS)) {
    for (const c of cites) {
      ids.add(c);
    }
  }
  return ids;
}

// ---------------------------------------------------------------------------
// Single-case runner
// ---------------------------------------------------------------------------

function runSingleCase(caseConfig: MissingDocsCase): CaseResult {
  const caseId = randomUUID();
  const applicationDate = new Date('2026-01-01');

  const caseData: CaseData = {
    applicantName: caseConfig.applicantName,
    householdSize: caseConfig.householdSize,
    requiredVerifications: [...caseConfig.requiredVerifications],
    verifiedItems: [],
    missingItems: [...caseConfig.missingItems],
    applicationFiledAt: applicationDate,
  };

  const policyPack = {
    sla: {} as Record<string, unknown>,
    ruleIndex: buildRuleIndex(),
  };

  const events: RunEvent[] = [];
  let currentState: CaseStatus = 'RECEIVED';

  const steps = buildSteps(caseConfig.variant, caseConfig.requiredVerifications);

  let determinationDate: Date | null = null;

  for (const step of steps) {
    const timestamp = addDays(applicationDate, step.dayOffset);

    // Apply pre-mutation (e.g. set verifiedItems before verification_complete)
    if (step.preMutate) {
      step.preMutate(caseData);
    }

    // Set verificationRequestedAt when request_verification fires
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
        `Transition failed for case ${caseConfig.caseIndex} ` +
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

    // Track determination time (approve, deny, or close_abandoned)
    if (
      step.action === 'approve' ||
      step.action === 'deny' ||
      step.action === 'close_abandoned' ||
      step.action === 'verification_refused'
    ) {
      determinationDate = timestamp;
    }
  }

  const timeToDecisionDays =
    determinationDate !== null
      ? daysBetween(applicationDate, determinationDate)
      : null;

  return {
    caseId,
    variant: caseConfig.variant,
    applicantName: caseConfig.applicantName,
    finalState: currentState,
    outcome: outcomeForVariant(caseConfig.variant),
    events,
    slaBreaches: slaBreachesForVariant(caseConfig.variant),
    timeToDecisionDays,
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function runMissingDocsScenario(cases: MissingDocsCase[]): RunResult {
  const runId = randomUUID();
  const caseResults: CaseResult[] = [];
  const errors: { caseIndex: number; error: string }[] = [];

  for (const caseConfig of cases) {
    try {
      caseResults.push(runSingleCase(caseConfig));
    } catch (err) {
      errors.push({
        caseIndex: caseConfig.caseIndex,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    runId,
    totalCases: cases.length,
    caseResults,
    errors,
  };
}
