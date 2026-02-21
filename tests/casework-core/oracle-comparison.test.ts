// tests/casework-core/oracle-comparison.test.ts
import { describe, it, expect } from 'vitest';
import { compareWithOracle, type ComparisonResult, type MismatchRecord } from '@core/oracle-comparison';
import type { OracleOutput, DeductionBreakdown } from '@core/oracle';

// ── Helper: build a minimal OracleOutput ─────────────────────────────────────

function makeOracleOutput(overrides: Partial<OracleOutput> = {}): OracleOutput {
  const defaultDeductions: DeductionBreakdown = {
    standardDeduction: 205,
    earnedIncomeDeduction: 200,
    dependentCareDeduction: 0,
    childSupportDeduction: 0,
    medicalDeduction: 0,
    excessShelterDeduction: 500,
    totalDeductions: 905,
    shelterCostDetail: {
      rent: 800,
      mortgage: 0,
      propertyTax: 0,
      insurance: 0,
      condoFees: 0,
      suaTier: 'heatingCooling',
      suaAmount: 546,
      totalShelterCosts: 1346,
    },
  };

  return {
    eligible: true,
    failedTests: [],
    grossIncome: 1200,
    netIncome: 295,
    benefitAmount: 210,
    deductions: defaultDeductions,
    citedRules: ['ELIG-GROSS-001', 'DED-STD-001', 'BEN-CALC-001'],
    calculationSteps: [],
    expeditedEligible: false,
    ...overrides,
  };
}

// ── Eligibility match/mismatch ───────────────────────────────────────────────

describe('Eligibility comparison', () => {
  it('detects eligibility match (both approved)', () => {
    const oracle = makeOracleOutput({ eligible: true, benefitAmount: 200 });
    const result = compareWithOracle('approved', 200, oracle.citedRules, oracle);

    expect(result.comparison.eligibilityMatch).toBe(true);
    expect(result.mismatches.find((m) => m.mismatchType === 'eligibility')).toBeUndefined();
  });

  it('detects eligibility match (both denied)', () => {
    const oracle = makeOracleOutput({ eligible: false, benefitAmount: 0 });
    const result = compareWithOracle('denied', 0, oracle.citedRules, oracle);

    expect(result.comparison.eligibilityMatch).toBe(true);
    expect(result.mismatches.find((m) => m.mismatchType === 'eligibility')).toBeUndefined();
  });

  it('detects eligibility mismatch (runner approved, oracle denied)', () => {
    const oracle = makeOracleOutput({ eligible: false, benefitAmount: 0 });
    const result = compareWithOracle('approved', 200, oracle.citedRules, oracle);

    expect(result.comparison.eligibilityMatch).toBe(false);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'eligibility');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('critical');
    expect(mismatch!.runnerValue).toBe('approved');
    expect(mismatch!.oracleValue).toBe('denied');
  });

  it('detects eligibility mismatch (runner denied, oracle approved)', () => {
    const oracle = makeOracleOutput({ eligible: true, benefitAmount: 200 });
    const result = compareWithOracle('denied', 0, oracle.citedRules, oracle);

    expect(result.comparison.eligibilityMatch).toBe(false);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'eligibility');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('critical');
    expect(mismatch!.runnerValue).toBe('denied');
    expect(mismatch!.oracleValue).toBe('approved');
  });
});

// ── Benefit amount comparison ────────────────────────────────────────────────

describe('Benefit amount comparison', () => {
  it('detects exact benefit match', () => {
    const oracle = makeOracleOutput({ benefitAmount: 200 });
    const result = compareWithOracle('approved', 200, oracle.citedRules, oracle);

    expect(result.comparison.benefitMatch).toBe(true);
    expect(result.comparison.benefitDelta).toBe(0);
    expect(result.mismatches.find((m) => m.mismatchType === 'benefit_amount')).toBeUndefined();
  });

  it('detects benefit mismatch with high severity (delta > 50)', () => {
    const oracle = makeOracleOutput({ benefitAmount: 200 });
    const result = compareWithOracle('approved', 100, oracle.citedRules, oracle);

    expect(result.comparison.benefitMatch).toBe(false);
    expect(result.comparison.benefitDelta).toBe(100);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'benefit_amount');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('high');
  });

  it('detects benefit mismatch with medium severity (delta 1-50)', () => {
    const oracle = makeOracleOutput({ benefitAmount: 200 });
    const result = compareWithOracle('approved', 180, oracle.citedRules, oracle);

    expect(result.comparison.benefitMatch).toBe(false);
    expect(result.comparison.benefitDelta).toBe(20);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'benefit_amount');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('medium');
  });

  it('treats delta of exactly 50 as medium severity', () => {
    const oracle = makeOracleOutput({ benefitAmount: 200 });
    const result = compareWithOracle('approved', 150, oracle.citedRules, oracle);

    expect(result.comparison.benefitDelta).toBe(50);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'benefit_amount');
    expect(mismatch!.severity).toBe('medium');
  });

  it('treats delta of 51 as high severity', () => {
    const oracle = makeOracleOutput({ benefitAmount: 200 });
    const result = compareWithOracle('approved', 149, oracle.citedRules, oracle);

    expect(result.comparison.benefitDelta).toBe(51);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'benefit_amount');
    expect(mismatch!.severity).toBe('high');
  });

  it('uses absolute value for delta (runner > oracle)', () => {
    const oracle = makeOracleOutput({ benefitAmount: 200 });
    const result = compareWithOracle('approved', 300, oracle.citedRules, oracle);

    expect(result.comparison.benefitDelta).toBe(100);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'benefit_amount');
    expect(mismatch!.severity).toBe('high');
  });
});

// ── Citation coverage ────────────────────────────────────────────────────────

describe('Citation comparison', () => {
  it('detects full citation coverage', () => {
    const oracle = makeOracleOutput({
      citedRules: ['ELIG-GROSS-001', 'DED-STD-001', 'BEN-CALC-001'],
    });
    const result = compareWithOracle(
      'approved',
      oracle.benefitAmount,
      ['ELIG-GROSS-001', 'DED-STD-001', 'BEN-CALC-001'],
      oracle,
    );

    expect(result.comparison.citationsCovered).toBe(true);
    expect(result.comparison.missingCitations).toEqual([]);
    expect(result.mismatches.find((m) => m.mismatchType === 'citation')).toBeUndefined();
  });

  it('detects missing citations', () => {
    const oracle = makeOracleOutput({
      citedRules: ['ELIG-GROSS-001', 'DED-STD-001', 'BEN-CALC-001'],
    });
    const result = compareWithOracle(
      'approved',
      oracle.benefitAmount,
      ['ELIG-GROSS-001'],
      oracle,
    );

    expect(result.comparison.citationsCovered).toBe(false);
    expect(result.comparison.missingCitations).toEqual(['DED-STD-001', 'BEN-CALC-001']);
    const mismatch = result.mismatches.find((m) => m.mismatchType === 'citation');
    expect(mismatch).toBeDefined();
    expect(mismatch!.severity).toBe('low');
  });

  it('allows extra runner citations (only checks oracle citations are covered)', () => {
    const oracle = makeOracleOutput({
      citedRules: ['ELIG-GROSS-001'],
    });
    const result = compareWithOracle(
      'approved',
      oracle.benefitAmount,
      ['ELIG-GROSS-001', 'EXTRA-001', 'EXTRA-002'],
      oracle,
    );

    expect(result.comparison.citationsCovered).toBe(true);
    expect(result.comparison.missingCitations).toEqual([]);
  });

  it('handles empty runner citations', () => {
    const oracle = makeOracleOutput({
      citedRules: ['ELIG-GROSS-001', 'BEN-CALC-001'],
    });
    const result = compareWithOracle(
      'approved',
      oracle.benefitAmount,
      [],
      oracle,
    );

    expect(result.comparison.citationsCovered).toBe(false);
    expect(result.comparison.missingCitations).toEqual(['ELIG-GROSS-001', 'BEN-CALC-001']);
  });
});

// ── Combined mismatch scenarios ──────────────────────────────────────────────

describe('Combined mismatches', () => {
  it('reports no mismatches when everything matches', () => {
    const oracle = makeOracleOutput({ eligible: true, benefitAmount: 200 });
    const result = compareWithOracle('approved', 200, oracle.citedRules, oracle);

    expect(result.mismatches).toEqual([]);
  });

  it('reports multiple mismatches simultaneously', () => {
    const oracle = makeOracleOutput({
      eligible: false,
      benefitAmount: 0,
      citedRules: ['ELIG-GROSS-001', 'DED-STD-001'],
    });
    const result = compareWithOracle('approved', 200, ['ELIG-GROSS-001'], oracle);

    // Should have: eligibility (critical), benefit (high), citation (low)
    expect(result.mismatches.length).toBe(3);
    expect(result.mismatches.find((m) => m.severity === 'critical')).toBeDefined();
    expect(result.mismatches.find((m) => m.severity === 'high')).toBeDefined();
    expect(result.mismatches.find((m) => m.severity === 'low')).toBeDefined();
  });

  it('returns properly typed ComparisonResult', () => {
    const oracle = makeOracleOutput();
    const result: ComparisonResult = compareWithOracle('approved', 210, oracle.citedRules, oracle);

    expect(result).toHaveProperty('comparison');
    expect(result).toHaveProperty('mismatches');
    expect(result.comparison).toHaveProperty('eligibilityMatch');
    expect(result.comparison).toHaveProperty('benefitMatch');
    expect(result.comparison).toHaveProperty('benefitDelta');
    expect(result.comparison).toHaveProperty('citationsCovered');
    expect(result.comparison).toHaveProperty('missingCitations');
  });
});
