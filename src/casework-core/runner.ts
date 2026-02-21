import { randomUUID } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { transition } from './state-machine';
import type {
  TransitionContext,
  CaseData,
  Role,
  CaseAction,
  CaseStatus,
} from './state-machine';
import type { MissingDocsCase, MissingDocsVariant } from './scenarios/missing-docs';
import type { AppealReversalCase, AppealReversalVariant } from './scenarios/appeal-reversal';
import { computeEligibility, type OracleOutput, type PolicyPackRules } from './oracle';
import { compareWithOracle, type OracleComparison, type MismatchRecord } from './oracle-comparison';

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
  oracleOutput?: OracleOutput;
  oracleComparison?: OracleComparison;
  mismatches?: MismatchRecord[];
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
  appeal_filed: ['CFR-273-15', 'SLA-APP-001'],
  schedule_hearing: ['CFR-273-15', 'SLA-APP-002'],
  render_decision: ['CFR-273-15'],
  implement_favorable: ['CFR-273-15', 'SLA-APP-004'],
  implement_unfavorable: ['CFR-273-15'],
  reopen_case: ['CFR-273-15'],
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
  preMutate?: (caseData: CaseData, applicationDate: Date) => void;
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
// Lazy-load policy-pack rules for oracle
// ---------------------------------------------------------------------------

const __filename_runner = fileURLToPath(import.meta.url);
const __dirname_runner = path.dirname(__filename_runner);

let _rules: PolicyPackRules | null = null;
function loadRules(): PolicyPackRules {
  if (!_rules) {
    _rules = JSON.parse(
      readFileSync(
        path.join(__dirname_runner, '../../policy-packs/snap-illinois-fy2026-v1/rules.json'),
        'utf-8',
      ),
    ) as PolicyPackRules;
  }
  return _rules;
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
      step.preMutate(caseData, applicationDate);
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

  // Oracle evaluation (skip abandoned cases)
  let oracleOutput: OracleOutput | undefined;
  let oracleComparison: OracleComparison | undefined;
  let mismatches: MismatchRecord[] | undefined;

  const outcome = outcomeForVariant(caseConfig.variant);

  if (caseConfig.oracleInput && outcome !== 'abandoned') {
    const rules = loadRules();
    oracleOutput = computeEligibility(caseConfig.oracleInput, rules);

    // Runner doesn't compute benefit amounts -- pass 0 for natural mismatches
    const runnerCitations = events.flatMap(e => e.citations);
    const result = compareWithOracle(
      outcome === 'approved' ? 'approved' : 'denied',
      0, // runner has no benefit calculation
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
    slaBreaches: slaBreachesForVariant(caseConfig.variant),
    timeToDecisionDays,
    oracleOutput,
    oracleComparison,
    mismatches,
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

// ---------------------------------------------------------------------------
// Appeal Reversal: Step sequences by variant
// ---------------------------------------------------------------------------

function buildAppealSteps(variant: AppealReversalVariant): StepDef[] {
  // Denial phase (common to all variants)
  const denialPhase: StepDef[] = [
    { dayOffset: 1, action: 'request_verification', role: 'intake_clerk', agentId: 'clerk-1' },
    {
      dayOffset: 5,
      action: 'receive_verification',
      role: 'intake_clerk',
      agentId: 'clerk-1',
      preMutate: (cd) => {
        cd.verifiedItems = ['identity', 'income', 'residency'];
        cd.missingItems = [];
      },
    },
    { dayOffset: 5, action: 'verification_complete', role: 'caseworker', agentId: 'worker-1' },
    {
      dayOffset: 7,
      action: 'deny',
      role: 'caseworker',
      agentId: 'worker-1',
      preMutate: (cd) => {
        cd.determinationResult = 'denied';
      },
    },
    {
      dayOffset: 9,
      action: 'send_notice',
      role: 'caseworker',
      agentId: 'worker-1',
      preMutate: (cd, applicationDate) => {
        cd.noticeSentAt = addDays(applicationDate, 9);
      },
    },
  ];

  // Appeal phase varies by variant
  switch (variant) {
    case 'favorable_reversal':
      return [
        ...denialPhase,
        {
          dayOffset: 24,
          action: 'appeal_filed',
          role: 'system',
          agentId: 'system',
          preMutate: (cd, applicationDate) => {
            cd.appealFiledAt = addDays(applicationDate, 24);
          },
        },
        {
          dayOffset: 27,
          action: 'schedule_hearing',
          role: 'supervisor',
          agentId: 'super-1',
          preMutate: (cd, applicationDate) => {
            cd.hearingScheduledAt = addDays(applicationDate, 27);
            cd.hearingDate = addDays(applicationDate, 47);
          },
        },
        {
          dayOffset: 42,
          action: 'render_decision',
          role: 'hearing_officer',
          agentId: 'officer-1',
          preMutate: (cd) => {
            cd.appealDecision = 'favorable';
          },
        },
        { dayOffset: 47, action: 'implement_favorable', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 48, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];

    case 'unfavorable_upheld':
      return [
        ...denialPhase,
        {
          dayOffset: 29,
          action: 'appeal_filed',
          role: 'system',
          agentId: 'system',
          preMutate: (cd, applicationDate) => {
            cd.appealFiledAt = addDays(applicationDate, 29);
          },
        },
        {
          dayOffset: 33,
          action: 'schedule_hearing',
          role: 'supervisor',
          agentId: 'super-1',
          preMutate: (cd, applicationDate) => {
            cd.hearingScheduledAt = addDays(applicationDate, 33);
            cd.hearingDate = addDays(applicationDate, 53);
          },
        },
        {
          dayOffset: 52,
          action: 'render_decision',
          role: 'hearing_officer',
          agentId: 'officer-1',
          preMutate: (cd) => {
            cd.appealDecision = 'unfavorable';
          },
        },
        { dayOffset: 57, action: 'implement_unfavorable', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 58, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];

    case 'remand_reopened':
      return [
        ...denialPhase,
        {
          dayOffset: 19,
          action: 'appeal_filed',
          role: 'system',
          agentId: 'system',
          preMutate: (cd, applicationDate) => {
            cd.appealFiledAt = addDays(applicationDate, 19);
          },
        },
        {
          dayOffset: 22,
          action: 'schedule_hearing',
          role: 'supervisor',
          agentId: 'super-1',
          preMutate: (cd, applicationDate) => {
            cd.hearingScheduledAt = addDays(applicationDate, 22);
            cd.hearingDate = addDays(applicationDate, 42);
          },
        },
        {
          dayOffset: 39,
          action: 'render_decision',
          role: 'hearing_officer',
          agentId: 'officer-1',
          preMutate: (cd) => {
            cd.appealDecision = 'remand';
          },
        },
        { dayOffset: 40, action: 'reopen_case', role: 'supervisor', agentId: 'super-1' },
        {
          dayOffset: 44,
          action: 'approve',
          role: 'caseworker',
          agentId: 'worker-1',
          preMutate: (cd) => {
            cd.determinationResult = 'approved';
          },
        },
        {
          dayOffset: 46,
          action: 'send_notice',
          role: 'caseworker',
          agentId: 'worker-1',
        },
        { dayOffset: 50, action: 'implement', role: 'supervisor', agentId: 'super-1' },
        { dayOffset: 51, action: 'close_case', role: 'supervisor', agentId: 'super-1' },
      ];
  }
}

// ---------------------------------------------------------------------------
// Appeal Reversal: Outcome helper
// ---------------------------------------------------------------------------

function outcomeForAppealVariant(variant: AppealReversalVariant): 'approved' | 'denied' {
  switch (variant) {
    case 'favorable_reversal':
    case 'remand_reopened':
      return 'approved';
    case 'unfavorable_upheld':
      return 'denied';
  }
}

// ---------------------------------------------------------------------------
// Appeal Reversal: Single-case runner
// ---------------------------------------------------------------------------

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

    // Apply pre-mutation
    if (step.preMutate) {
      step.preMutate(caseData, applicationDate);
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

    // Track determination time
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
    const compResult = compareWithOracle(
      outcome,
      0,
      runnerCitations,
      oracleOutput,
    );
    oracleComparison = compResult.comparison;
    mismatches = compResult.mismatches;
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

// ---------------------------------------------------------------------------
// Appeal Reversal: Public entry point
// ---------------------------------------------------------------------------

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

  return {
    runId,
    totalCases: cases.length,
    caseResults,
    errors,
  };
}
