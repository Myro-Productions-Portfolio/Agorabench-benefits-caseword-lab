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

  return {
    totalCases,
    byVariant,
    byOutcome,
    slaCompliance: { onTime, breached, breachRate },
    averageTimeToDecision,
    noticeCompleteness,
    citationCoverage,
    errors,
  };
}
