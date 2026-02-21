// src/casework-core/oracle-comparison.ts
// Compares a runner's decision against the oracle's deterministic output.
// Returns structured mismatch records with severity levels.

import type { OracleOutput } from './oracle';

// ── Types ────────────────────────────────────────────────────────────────────

export interface OracleComparison {
  eligibilityMatch: boolean;
  benefitMatch: boolean;
  benefitDelta: number;
  citationsCovered: boolean;
  missingCitations: string[];
}

export type MismatchType = 'eligibility' | 'benefit_amount' | 'deduction' | 'citation';
export type MismatchSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface MismatchRecord {
  mismatchType: MismatchType;
  severity: MismatchSeverity;
  runnerValue: string | number | boolean;
  oracleValue: string | number | boolean;
  detail: string;
}

export interface ComparisonResult {
  comparison: OracleComparison;
  mismatches: MismatchRecord[];
}

// ── Main comparison function ─────────────────────────────────────────────────

export function compareWithOracle(
  runnerDecision: 'approved' | 'denied',
  runnerBenefitAmount: number,
  runnerCitations: string[],
  oracle: OracleOutput,
): ComparisonResult {
  const mismatches: MismatchRecord[] = [];

  // ── Eligibility comparison ──────────────────────────────────────────────
  const runnerEligible = runnerDecision === 'approved';
  const eligibilityMatch = runnerEligible === oracle.eligible;

  if (!eligibilityMatch) {
    mismatches.push({
      mismatchType: 'eligibility',
      severity: 'critical',
      runnerValue: runnerDecision,
      oracleValue: oracle.eligible ? 'approved' : 'denied',
      detail: `Runner decided "${runnerDecision}" but oracle determined "${oracle.eligible ? 'approved' : 'denied'}"`,
    });
  }

  // ── Benefit amount comparison ───────────────────────────────────────────
  const benefitDelta = Math.abs(runnerBenefitAmount - oracle.benefitAmount);
  const benefitMatch = benefitDelta === 0;

  if (!benefitMatch) {
    const severity: MismatchSeverity = benefitDelta > 50 ? 'high' : 'medium';

    mismatches.push({
      mismatchType: 'benefit_amount',
      severity,
      runnerValue: runnerBenefitAmount,
      oracleValue: oracle.benefitAmount,
      detail: `Benefit amount differs by $${benefitDelta} (runner: $${runnerBenefitAmount}, oracle: $${oracle.benefitAmount})`,
    });
  }

  // ── Citation coverage ──────────────────────────────────────────────────
  const runnerCitationSet = new Set(runnerCitations);
  const missingCitations = oracle.citedRules.filter(
    (rule) => !runnerCitationSet.has(rule),
  );
  const citationsCovered = missingCitations.length === 0;

  if (!citationsCovered) {
    mismatches.push({
      mismatchType: 'citation',
      severity: 'low',
      runnerValue: runnerCitations.join(', '),
      oracleValue: oracle.citedRules.join(', '),
      detail: `Missing citations: ${missingCitations.join(', ')}`,
    });
  }

  return {
    comparison: {
      eligibilityMatch,
      benefitMatch,
      benefitDelta,
      citationsCovered,
      missingCitations,
    },
    mismatches,
  };
}
