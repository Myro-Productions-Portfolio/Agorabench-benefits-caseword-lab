import type { RunResult } from './runner';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RunSummary {
  totalCases: number;
  byVariant: Record<string, number>;
  byOutcome: { approved: number; denied: number; abandoned: number };
  slaCompliance: { onTime: number; breached: number; breachRate: number };
  averageTimeToDecision: number;
  noticeCompleteness: number;
  citationCoverage: number;
  errors: { caseId: string; error: string }[];
  oracleMetrics: {
    casesEvaluated: number;
    eligibilityMatchRate: number;
    benefitExactMatchRate: number;
    averageBenefitDelta: number;
    mismatchCount: number;
    mismatchesBySeverity: Record<string, number>;
  };
  appealMetrics?: {
    casesAppealed: number;
    favorableRate: number;
    unfavorableRate: number;
    remandRate: number;
    avgTimeToDecision: number;
  };
}

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

export function computeRunSummary(result: RunResult): RunSummary {
  const byVariant: Record<string, number> = {};
  const byOutcome = { approved: 0, denied: 0, abandoned: 0 };

  let breached = 0;
  let totalDays = 0;
  let decidedCount = 0;
  let totalEvents = 0;
  let eventsWithCitations = 0;

  for (const cr of result.caseResults) {
    // byVariant
    byVariant[cr.variant] = (byVariant[cr.variant] ?? 0) + 1;

    // byOutcome
    byOutcome[cr.outcome] += 1;

    // SLA breaches
    if (cr.slaBreaches.length > 0) {
      breached += 1;
    }

    // Time to decision
    if (cr.timeToDecisionDays !== null) {
      totalDays += cr.timeToDecisionDays;
      decidedCount += 1;
    }

    // Citation coverage
    for (const ev of cr.events) {
      totalEvents += 1;
      if (ev.citations.length > 0) {
        eventsWithCitations += 1;
      }
    }
  }

  const totalCases = result.caseResults.length;
  const onTime = totalCases - breached;
  const breachRate = totalCases > 0 ? breached / totalCases : 0;
  const averageTimeToDecision = decidedCount > 0 ? totalDays / decidedCount : 0;
  const citationCoverage = totalEvents > 0 ? eventsWithCitations / totalEvents : 0;

  // Scripted notices are complete by construction
  const noticeCompleteness = 1;

  // Map errors from result.errors (which use caseIndex) to { caseId, error }
  const errors = result.errors.map((e) => ({
    caseId: `case-${e.caseIndex}`,
    error: e.error,
  }));

  // Oracle accuracy metrics
  let casesEvaluated = 0;
  let eligibilityMatches = 0;
  let benefitMatches = 0;
  let totalBenefitDelta = 0;
  let totalMismatches = 0;
  const mismatchesBySeverity: Record<string, number> = {};

  for (const cr of result.caseResults) {
    if (cr.oracleComparison) {
      casesEvaluated++;
      if (cr.oracleComparison.eligibilityMatch) eligibilityMatches++;
      if (cr.oracleComparison.benefitMatch) benefitMatches++;
      totalBenefitDelta += Math.abs(cr.oracleComparison.benefitDelta);
    }
    if (cr.mismatches) {
      totalMismatches += cr.mismatches.length;
      for (const m of cr.mismatches) {
        mismatchesBySeverity[m.severity] = (mismatchesBySeverity[m.severity] ?? 0) + 1;
      }
    }
  }

  const oracleMetrics = {
    casesEvaluated,
    eligibilityMatchRate: casesEvaluated > 0 ? eligibilityMatches / casesEvaluated : 0,
    benefitExactMatchRate: casesEvaluated > 0 ? benefitMatches / casesEvaluated : 0,
    averageBenefitDelta: casesEvaluated > 0 ? totalBenefitDelta / casesEvaluated : 0,
    mismatchCount: totalMismatches,
    mismatchesBySeverity,
  };

  // Appeal metrics (only for appeal reversal scenarios)
  const appealVariants = new Set(['favorable_reversal', 'unfavorable_upheld', 'remand_reopened']);
  const appealCases = result.caseResults.filter(cr => appealVariants.has(cr.variant));

  let appealMetrics: RunSummary['appealMetrics'];

  if (appealCases.length > 0) {
    let favorableCount = 0;
    let unfavorableCount = 0;
    let remandCount = 0;
    let appealDecisionDays = 0;
    let appealDecidedCount = 0;

    for (const cr of appealCases) {
      if (cr.variant === 'favorable_reversal') favorableCount++;
      if (cr.variant === 'unfavorable_upheld') unfavorableCount++;
      if (cr.variant === 'remand_reopened') remandCount++;

      if (cr.timeToDecisionDays !== null) {
        appealDecisionDays += cr.timeToDecisionDays;
        appealDecidedCount++;
      }
    }

    const casesAppealed = appealCases.length;

    appealMetrics = {
      casesAppealed,
      favorableRate: casesAppealed > 0 ? favorableCount / casesAppealed : 0,
      unfavorableRate: casesAppealed > 0 ? unfavorableCount / casesAppealed : 0,
      remandRate: casesAppealed > 0 ? remandCount / casesAppealed : 0,
      avgTimeToDecision: appealDecidedCount > 0 ? appealDecisionDays / appealDecidedCount : 0,
    };
  }

  return {
    totalCases,
    byVariant,
    byOutcome,
    slaCompliance: { onTime, breached, breachRate },
    averageTimeToDecision,
    noticeCompleteness,
    citationCoverage,
    errors,
    oracleMetrics,
    appealMetrics,
  };
}
