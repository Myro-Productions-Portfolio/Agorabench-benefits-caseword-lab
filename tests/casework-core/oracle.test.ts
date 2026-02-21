// tests/casework-core/oracle.test.ts
import { describe, it, expect } from 'vitest';
import {
  computeEligibility,
  type OracleInput,
  type PolicyPackRules,
  type HouseholdMember,
  type IncomeItem,
  type ResourceItem,
  type ShelterCosts,
  type OracleOutput,
  type FailedTest,
  type DeductionBreakdown,
  type CalculationStep,
} from '@core/oracle';

// ── Load real rules.json ─────────────────────────────────────────────────────

import rules from '../../policy-packs/snap-illinois-fy2026-v1/rules.json';
const policyRules = rules as PolicyPackRules;

// ── Helper: build a minimal valid input ──────────────────────────────────────

function makeInput(overrides: Partial<OracleInput> = {}): OracleInput {
  return {
    householdSize: 1,
    householdMembers: [
      { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
    ],
    income: [],
    resources: [],
    shelterCosts: { suaTier: 'none' },
    applicationDate: '2026-01-15',
    policyPackId: 'snap-illinois-fy2026-v1',
    ...overrides,
  };
}

// ── Type constructability ────────────────────────────────────────────────────

describe('Oracle types', () => {
  it('constructs HouseholdMember', () => {
    const member: HouseholdMember = {
      age: 45,
      isDisabled: false,
      isStudent: false,
      citizenshipStatus: 'citizen',
    };
    expect(member.age).toBe(45);
    expect(member.citizenshipStatus).toBe('citizen');
  });

  it('constructs IncomeItem', () => {
    const item: IncomeItem = {
      type: 'earned',
      amount: 1000,
      frequency: 'monthly',
      source: 'employment',
      verified: true,
    };
    expect(item.type).toBe('earned');
    expect(item.amount).toBe(1000);
  });

  it('constructs ResourceItem', () => {
    const item: ResourceItem = {
      type: 'checking_account',
      value: 500,
      countable: true,
    };
    expect(item.countable).toBe(true);
  });

  it('constructs ShelterCosts', () => {
    const shelter: ShelterCosts = {
      rent: 800,
      suaTier: 'heatingCooling',
    };
    expect(shelter.rent).toBe(800);
    expect(shelter.suaTier).toBe('heatingCooling');
  });

  it('constructs OracleOutput shape', () => {
    const output = computeEligibility(makeInput(), policyRules);
    expect(output).toHaveProperty('eligible');
    expect(output).toHaveProperty('grossIncome');
    expect(output).toHaveProperty('netIncome');
    expect(output).toHaveProperty('benefitAmount');
    expect(output).toHaveProperty('deductions');
    expect(output).toHaveProperty('citedRules');
    expect(output).toHaveProperty('calculationSteps');
    expect(output).toHaveProperty('expeditedEligible');
    expect(output).toHaveProperty('failedTests');
  });

  it('constructs FailedTest shape', () => {
    const ft: FailedTest = {
      testName: 'Resource Test',
      ruleId: 'ELIG-RES-001',
      reason: 'Over limit',
      actual: 5000,
      limit: 3000,
    };
    expect(ft.testName).toBe('Resource Test');
  });

  it('constructs DeductionBreakdown shape', () => {
    const output = computeEligibility(makeInput(), policyRules);
    const d = output.deductions;
    expect(d).toHaveProperty('standardDeduction');
    expect(d).toHaveProperty('earnedIncomeDeduction');
    expect(d).toHaveProperty('dependentCareDeduction');
    expect(d).toHaveProperty('childSupportDeduction');
    expect(d).toHaveProperty('medicalDeduction');
    expect(d).toHaveProperty('excessShelterDeduction');
    expect(d).toHaveProperty('totalDeductions');
    expect(d).toHaveProperty('shelterCostDetail');
  });

  it('constructs CalculationStep shape', () => {
    const step: CalculationStep = {
      stepNumber: 1,
      description: 'test',
      ruleId: 'TEST-001',
      inputs: { foo: 42 },
      output: true,
      formula: 'a + b',
    };
    expect(step.stepNumber).toBe(1);
  });
});

// ── Income conversion ────────────────────────────────────────────────────────

describe('Income conversion', () => {
  it('converts weekly income to monthly (weekly * 4.3)', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 500, frequency: 'weekly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    // 500 * 4.3 = 2150
    expect(result.grossIncome).toBe(2150);
  });

  it('converts biweekly income to monthly (biweekly * 2.15)', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 1000, frequency: 'biweekly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    // 1000 * 2.15 = 2150
    expect(result.grossIncome).toBe(2150);
  });

  it('converts annual income to monthly (annual / 12)', () => {
    const input = makeInput({
      income: [
        { type: 'unearned', amount: 12000, frequency: 'annual', source: 'pension', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    // 12000 / 12 = 1000
    expect(result.grossIncome).toBe(1000);
  });

  it('passes monthly income through unchanged', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 800, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.grossIncome).toBe(800);
  });

  it('excludes income with type "excluded"', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 500, frequency: 'monthly', source: 'job', verified: true },
        { type: 'excluded', amount: 300, frequency: 'monthly', source: 'gift', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.grossIncome).toBe(500);
  });

  it('sums earned and unearned income separately', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 1000, frequency: 'monthly', source: 'job', verified: true },
        { type: 'unearned', amount: 200, frequency: 'monthly', source: 'SSI', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.grossIncome).toBe(1200);
    // Earned income deduction only applies to the earned portion
    expect(result.deductions.earnedIncomeDeduction).toBe(Math.floor(1000 * 0.20));
  });
});

// ── Resource test ────────────────────────────────────────────────────────────

describe('Resource test', () => {
  it('passes when countable resources are under the standard limit ($3000)', () => {
    const input = makeInput({
      resources: [
        { type: 'checking', value: 2000, countable: true },
        { type: 'car', value: 5000, countable: false },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.eligible).toBe(true);
  });

  it('fails when countable resources exceed the standard limit ($3000)', () => {
    const input = makeInput({
      resources: [{ type: 'savings', value: 3500, countable: true }],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.eligible).toBe(false);
    expect(result.failedTests.length).toBeGreaterThanOrEqual(1);
    expect(result.failedTests[0].testName).toBe('Resource Test');
  });

  it('uses higher limit ($4500) when household has qualifying member', () => {
    const input = makeInput({
      householdMembers: [
        { age: 65, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      resources: [{ type: 'savings', value: 4000, countable: true }],
    });
    const result = computeEligibility(input, policyRules);
    // 4000 <= 4500, should pass resource test
    expect(result.failedTests.find((t) => t.testName === 'Resource Test')).toBeUndefined();
  });

  it('fails with qualifying member when resources exceed $4500', () => {
    const input = makeInput({
      householdMembers: [
        { age: 65, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      resources: [{ type: 'savings', value: 5000, countable: true }],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.eligible).toBe(false);
    expect(result.failedTests[0].testName).toBe('Resource Test');
  });

  it('only counts countable resources', () => {
    const input = makeInput({
      resources: [
        { type: 'checking', value: 2000, countable: true },
        { type: 'vehicle', value: 10000, countable: false },
        { type: 'savings', value: 800, countable: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    // 2000 + 800 = 2800 <= 3000
    expect(result.failedTests.find((t) => t.testName === 'Resource Test')).toBeUndefined();
  });
});

// ── Gross income test ────────────────────────────────────────────────────────

describe('Gross income test', () => {
  it('applies 165% FPL for standard household (size 1)', () => {
    // FPL for size 1 = 1305. 165% = floor(1305 * 165 / 100) = 2153
    const threshold = Math.floor(1305 * 165 / 100);

    // Just under the threshold
    const input = makeInput({
      income: [
        { type: 'earned', amount: threshold - 1, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.failedTests.find((t) => t.testName === 'Gross Income Test')).toBeUndefined();
  });

  it('fails gross income test when over 165% FPL', () => {
    // Way over threshold
    const input = makeInput({
      income: [
        { type: 'earned', amount: 3000, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.eligible).toBe(false);
    expect(result.failedTests.find((t) => t.testName === 'Gross Income Test')).toBeDefined();
  });

  it('applies 200% FPL for elderly/disabled household (size 1)', () => {
    // FPL for size 1 = 1305. 200% = floor(1305 * 200 / 100) = 2610
    const threshold200 = Math.floor(1305 * 200 / 100);
    const threshold165 = Math.floor(1305 * 165 / 100);

    // Income between 165% and 200% -- would fail standard, should pass elderly
    const income = threshold165 + 100;

    const input = makeInput({
      householdMembers: [
        { age: 70, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'unearned', amount: income, frequency: 'monthly', source: 'pension', verified: true },
      ],
    });

    const result = computeEligibility(input, policyRules);
    expect(result.failedTests.find((t) => t.testName === 'Gross Income Test')).toBeUndefined();
  });

  it('detects disabled member for 200% FPL threshold', () => {
    const threshold165 = Math.floor(1305 * 165 / 100);
    const income = threshold165 + 50;

    const input = makeInput({
      householdMembers: [
        { age: 35, isDisabled: true, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'earned', amount: income, frequency: 'monthly', source: 'job', verified: true },
      ],
    });

    const result = computeEligibility(input, policyRules);
    expect(result.failedTests.find((t) => t.testName === 'Gross Income Test')).toBeUndefined();
  });
});

// ── Standard deduction ───────────────────────────────────────────────────────

describe('Standard deduction', () => {
  it('applies $205 for household size 1', () => {
    const input = makeInput({ householdSize: 1 });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.standardDeduction).toBe(205);
  });

  it('applies $205 for household size 2', () => {
    const input = makeInput({
      householdSize: 2,
      householdMembers: [
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 28, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.standardDeduction).toBe(205);
  });

  it('applies $205 for household size 3', () => {
    const input = makeInput({
      householdSize: 3,
      householdMembers: [
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 28, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 5, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.standardDeduction).toBe(205);
  });

  it('applies $219 for household size 4', () => {
    const members: HouseholdMember[] = Array.from({ length: 4 }, () => ({
      age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' as const,
    }));
    const input = makeInput({ householdSize: 4, householdMembers: members });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.standardDeduction).toBe(219);
  });

  it('applies $257 for household size 5', () => {
    const members: HouseholdMember[] = Array.from({ length: 5 }, () => ({
      age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' as const,
    }));
    const input = makeInput({ householdSize: 5, householdMembers: members });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.standardDeduction).toBe(257);
  });

  it('applies $295 for household size 6+', () => {
    const members: HouseholdMember[] = Array.from({ length: 7 }, () => ({
      age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' as const,
    }));
    const input = makeInput({ householdSize: 7, householdMembers: members });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.standardDeduction).toBe(295);
  });
});

// ── Earned income deduction ──────────────────────────────────────────────────

describe('Earned income deduction', () => {
  it('applies 20% earned income deduction', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 1000, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.earnedIncomeDeduction).toBe(200);
  });

  it('floors the earned income deduction', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 333, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    // floor(333 * 0.20) = floor(66.6) = 66
    expect(result.deductions.earnedIncomeDeduction).toBe(66);
  });

  it('does not apply earned income deduction to unearned income', () => {
    const input = makeInput({
      income: [
        { type: 'unearned', amount: 1000, frequency: 'monthly', source: 'SSI', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.earnedIncomeDeduction).toBe(0);
  });
});

// ── Medical deduction ────────────────────────────────────────────────────────

describe('Medical deduction', () => {
  it('applies medical deduction only for elderly/disabled members', () => {
    const input = makeInput({
      householdMembers: [
        { age: 70, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      medicalExpenses: 100,
    });
    const result = computeEligibility(input, policyRules);
    // 100 - 35 = 65
    expect(result.deductions.medicalDeduction).toBe(65);
  });

  it('does not apply medical deduction for non-elderly/non-disabled', () => {
    const input = makeInput({
      medicalExpenses: 100,
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.medicalDeduction).toBe(0);
  });

  it('applies $35 threshold', () => {
    const input = makeInput({
      householdMembers: [
        { age: 65, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      medicalExpenses: 35,
    });
    const result = computeEligibility(input, policyRules);
    // 35 - 35 = 0
    expect(result.deductions.medicalDeduction).toBe(0);
  });

  it('returns zero when medical expenses are below threshold', () => {
    const input = makeInput({
      householdMembers: [
        { age: 65, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      medicalExpenses: 20,
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.medicalDeduction).toBe(0);
  });

  it('applies for disabled members under 60', () => {
    const input = makeInput({
      householdMembers: [
        { age: 40, isDisabled: true, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      medicalExpenses: 200,
    });
    const result = computeEligibility(input, policyRules);
    // 200 - 35 = 165
    expect(result.deductions.medicalDeduction).toBe(165);
  });
});

// ── Excess shelter deduction ─────────────────────────────────────────────────

describe('Excess shelter deduction', () => {
  it('calculates excess shelter correctly', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 1000, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: {
        rent: 800,
        suaTier: 'heatingCooling',
      },
    });
    const result = computeEligibility(input, policyRules);

    // Pre-shelter adjusted income = 1000 - 205 (std) - 200 (earned) = 595
    // Total shelter = 800 + 546 (SUA heatingCooling) = 1346
    // Excess = 1346 - (595 * 0.50) = 1346 - 297.5 = 1048.5
    // Capped at 744 for non-elderly
    expect(result.deductions.excessShelterDeduction).toBe(744);
  });

  it('caps excess shelter at $744 for non-elderly/non-disabled', () => {
    const input = makeInput({
      shelterCosts: {
        rent: 1500,
        suaTier: 'heatingCooling',
      },
    });
    const result = computeEligibility(input, policyRules);
    // With zero income: excess = 1500 + 546 = 2046, capped at 744
    expect(result.deductions.excessShelterDeduction).toBe(744);
  });

  it('does NOT cap excess shelter for elderly/disabled', () => {
    const input = makeInput({
      householdMembers: [
        { age: 70, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      shelterCosts: {
        rent: 1500,
        suaTier: 'heatingCooling',
      },
    });
    const result = computeEligibility(input, policyRules);
    // With zero income: adjusted = 0 - 205 = -205, so halfAdjusted = -205 * 0.50 = -102.5
    // excess = max(0, 1500 + 546 - (-102.5)) = 2148.5 => not capped
    expect(result.deductions.excessShelterDeduction).toBeGreaterThan(744);
  });

  it('includes SUA in shelter costs', () => {
    const input = makeInput({
      shelterCosts: {
        rent: 500,
        suaTier: 'heatingCooling',
      },
    });
    const result = computeEligibility(input, policyRules);
    // SUA heatingCooling = 546
    expect(result.deductions.shelterCostDetail.suaAmount).toBe(546);
    expect(result.deductions.shelterCostDetail.totalShelterCosts).toBe(500 + 546);
  });

  it('uses zero SUA for "none" tier', () => {
    const input = makeInput({
      shelterCosts: {
        rent: 500,
        suaTier: 'none',
      },
    });
    const result = computeEligibility(input, policyRules);
    expect(result.deductions.shelterCostDetail.suaAmount).toBe(0);
    expect(result.deductions.shelterCostDetail.totalShelterCosts).toBe(500);
  });

  it('returns zero excess shelter when shelter < 50% adjusted income', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 2000, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: {
        rent: 100,
        suaTier: 'none',
      },
    });
    const result = computeEligibility(input, policyRules);
    // Pre-shelter adjusted = 2000 - 205 - 400 = 1395
    // half = 697.5
    // excess = max(0, 100 - 697.5) = 0
    expect(result.deductions.excessShelterDeduction).toBe(0);
  });
});

// ── Net income test ──────────────────────────────────────────────────────────

describe('Net income test', () => {
  it('passes when net income is under 100% FPL', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 1000, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: { rent: 500, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, policyRules);
    // FPL 100% for size 1 = 1305
    expect(result.netIncome).toBeLessThanOrEqual(1305);
    expect(result.failedTests.find((t) => t.testName === 'Net Income Test')).toBeUndefined();
  });

  it('fails when net income exceeds 100% FPL', () => {
    // Need high income that passes gross test but fails net test
    // For size 1: gross limit 165% = 2153, net limit 100% = 1305
    // With minimal deductions (just std 205 + earned 20%), need net > 1305
    const input = makeInput({
      income: [
        { type: 'earned', amount: 2100, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: { suaTier: 'none' },
    });
    const result = computeEligibility(input, policyRules);
    // gross = 2100. Passes gross test (2100 < 2153).
    // Deductions: std 205 + earned floor(2100*0.20) = 420 + shelter 0 = 625
    // Net = 2100 - 625 = 1475 > 1305
    expect(result.eligible).toBe(false);
    expect(result.failedTests.find((t) => t.testName === 'Net Income Test')).toBeDefined();
  });
});

// ── Benefit calculation ──────────────────────────────────────────────────────

describe('Benefit calculation', () => {
  it('calculates benefit as floor(maxAllotment - 0.30 * netIncome)', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 800, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: { rent: 500, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, policyRules);
    // Max allotment for size 1 = 298
    // Verify benefit formula
    const expectedBenefit = Math.floor(298 - 0.30 * result.netIncome);
    // Apply minimum benefit if applicable
    if (expectedBenefit > 0 && expectedBenefit < 24) {
      expect(result.benefitAmount).toBe(24);
    } else if (expectedBenefit > 0) {
      expect(result.benefitAmount).toBe(expectedBenefit);
    }
  });

  it('floors benefit amount', () => {
    // We want netIncome such that 298 - 0.30 * net has a fractional part
    // e.g. netIncome = 100: 298 - 30 = 268 (integer)
    // netIncome = 101: 298 - 30.3 = 267.7 -> floor = 267
    const input = makeInput({
      income: [
        { type: 'earned', amount: 800, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: { rent: 400, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, policyRules);
    expect(Number.isInteger(result.benefitAmount)).toBe(true);
  });
});

// ── Minimum benefit ──────────────────────────────────────────────────────────

describe('Minimum benefit', () => {
  it('applies $24 minimum for household size 1', () => {
    // Need benefit > 0 but < 24
    // maxAllotment(1) = 298, so need netIncome such that floor(298 - 0.30*net) is between 1 and 23
    // 298 - 0.30*net = 23 => net = (298-23)/0.30 = 916.67
    // 298 - 0.30*net = 1 => net = (298-1)/0.30 = 990
    // So netIncome around 920 should give benefit < 24
    // Gross income: need to pass 165% FPL (2153 for size 1)
    // With std deduction 205 and earned deduction, we need gross around 1200
    // Actually we need net ~920. With gross 1200: earned deduction 240, std 205,
    // shelter 0 => net = 1200 - 445 = 755. Too low.
    // Let's try unearned income (no earned deduction):
    // net = gross - 205 (std only). For net = 920: gross = 1125
    const input = makeInput({
      income: [
        { type: 'unearned', amount: 1125, frequency: 'monthly', source: 'benefits', verified: true },
      ],
      shelterCosts: { suaTier: 'none' },
    });
    const result = computeEligibility(input, policyRules);
    // net = 1125 - 205 = 920
    // benefit = floor(298 - 0.30 * 920) = floor(298 - 276) = floor(22) = 22
    // 22 < 24, so minimum benefit applies
    expect(result.netIncome).toBe(920);
    expect(result.benefitAmount).toBe(24);
  });

  it('applies $24 minimum for household size 2', () => {
    // maxAllotment(2) = 546. For benefit 1-23: net = (546-23)/0.30 = 1743.3
    // gross must pass 165% FPL for size 2: floor(1763 * 165/100) = 2908
    // unearned: net = gross - 205, for net = 1743: gross = 1948
    const input = makeInput({
      householdSize: 2,
      householdMembers: [
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 28, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'unearned', amount: 1748, frequency: 'monthly', source: 'benefits', verified: true },
      ],
      shelterCosts: { suaTier: 'none' },
    });
    const result = computeEligibility(input, policyRules);
    // net = 1748 - 205 = 1543
    // benefit = floor(546 - 0.30 * 1543) = floor(546 - 462.9) = floor(83.1) = 83
    // 83 >= 24, so minimum doesn't apply
    // Let's verify with a net that gives low benefit
    // Actually let's use income that gives benefit < 24:
    // net = (546-23)/0.30 = 1743.33 -> gross = 1743 + 205 = 1948
    const input2 = makeInput({
      householdSize: 2,
      householdMembers: [
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 28, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'unearned', amount: 1948, frequency: 'monthly', source: 'benefits', verified: true },
      ],
      shelterCosts: { suaTier: 'none' },
    });
    const result2 = computeEligibility(input2, policyRules);
    // net = 1948 - 205 = 1743
    // benefit = floor(546 - 0.30 * 1743) = floor(546 - 522.9) = floor(23.1) = 23
    // 23 < 24, min benefit applies
    expect(result2.benefitAmount).toBe(24);
  });

  it('does NOT apply minimum benefit for household size 3+', () => {
    // maxAllotment(3) = 785. For benefit 1-23: net needs to be high
    // net = (785-1)/0.30 = 2613.33
    // But net income limit for size 3 is FPL 100% = 2221
    // So benefit will always be > 23 for size 3 as long as eligible
    // Let's verify: net = 2221 -> benefit = floor(785 - 0.30*2221) = floor(785-666.3) = 118
    // So we can't get benefit < 24 for size 3 before failing net test.
    // This means minimum benefit is structurally irrelevant for size 3+, but let's
    // test that it doesn't artificially set to 24.
    const members: HouseholdMember[] = Array.from({ length: 3 }, () => ({
      age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' as const,
    }));
    const input = makeInput({
      householdSize: 3,
      householdMembers: members,
      income: [
        { type: 'unearned', amount: 2000, frequency: 'monthly', source: 'benefits', verified: true },
      ],
      shelterCosts: { suaTier: 'none' },
    });
    const result = computeEligibility(input, policyRules);
    // net = 2000 - 205 = 1795
    // benefit = floor(785 - 0.30*1795) = floor(785 - 538.5) = floor(246.5) = 246
    expect(result.benefitAmount).toBe(246);
  });
});

// ── Full pipeline tests ──────────────────────────────────────────────────────

describe('Full pipeline', () => {
  it('single person, no income: max benefit $298', () => {
    const input = makeInput();
    const result = computeEligibility(input, policyRules);

    expect(result.eligible).toBe(true);
    expect(result.grossIncome).toBe(0);
    expect(result.netIncome).toBe(0);
    expect(result.benefitAmount).toBe(298);
    expect(result.failedTests).toEqual([]);
    expect(result.calculationSteps.length).toBe(16);
    expect(result.expeditedEligible).toBe(false);
    expect(result.citedRules.length).toBeGreaterThan(0);
  });

  it('family with mixed income types', () => {
    const input = makeInput({
      householdSize: 4,
      householdMembers: [
        { age: 35, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 33, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 10, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 7, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'earned', amount: 1500, frequency: 'monthly', source: 'job', verified: true },
        { type: 'unearned', amount: 200, frequency: 'monthly', source: 'child_support', verified: true },
        { type: 'excluded', amount: 100, frequency: 'monthly', source: 'gift', verified: true },
      ],
      resources: [{ type: 'checking', value: 500, countable: true }],
      shelterCosts: {
        rent: 900,
        suaTier: 'heatingCooling',
      },
      dependentCareCosts: 200,
    });

    const result = computeEligibility(input, policyRules);

    expect(result.grossIncome).toBe(1700); // 1500 + 200 (excluded is excluded)
    expect(result.deductions.standardDeduction).toBe(219); // size 4
    expect(result.deductions.earnedIncomeDeduction).toBe(300); // floor(1500 * 0.20)
    expect(result.deductions.dependentCareDeduction).toBe(200);
    expect(result.eligible).toBe(true);
    expect(result.benefitAmount).toBeGreaterThan(0);
  });

  it('elderly/disabled household with medical expenses', () => {
    const input = makeInput({
      householdSize: 2,
      householdMembers: [
        { age: 72, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 68, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'unearned', amount: 800, frequency: 'monthly', source: 'social_security', verified: true },
      ],
      resources: [{ type: 'savings', value: 2000, countable: true }],
      shelterCosts: {
        rent: 600,
        propertyTax: 100,
        suaTier: 'heatingCooling',
      },
      medicalExpenses: 150,
    });

    const result = computeEligibility(input, policyRules);

    expect(result.grossIncome).toBe(800);
    expect(result.deductions.medicalDeduction).toBe(115); // 150 - 35
    expect(result.deductions.earnedIncomeDeduction).toBe(0); // no earned income
    // Excess shelter should NOT be capped (elderly household)
    expect(result.eligible).toBe(true);
    expect(result.benefitAmount).toBeGreaterThan(0);
  });

  it('ineligible due to excess resources', () => {
    const input = makeInput({
      resources: [{ type: 'savings', value: 5000, countable: true }],
    });
    const result = computeEligibility(input, policyRules);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Resources');
    expect(result.failedTests.length).toBe(1);
    expect(result.benefitAmount).toBe(0);
  });

  it('ineligible due to gross income', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 3000, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);

    expect(result.eligible).toBe(false);
    expect(result.reason).toContain('Gross income');
    expect(result.benefitAmount).toBe(0);
  });

  it('records all 16 calculation steps for eligible case', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 800, frequency: 'monthly', source: 'job', verified: true },
      ],
      shelterCosts: { rent: 500, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, policyRules);

    expect(result.calculationSteps.length).toBe(16);
    for (let i = 0; i < 16; i++) {
      expect(result.calculationSteps[i].stepNumber).toBe(i + 1);
    }
  });

  it('stops at resource test failure (fewer than 16 steps)', () => {
    const input = makeInput({
      resources: [{ type: 'savings', value: 5000, countable: true }],
    });
    const result = computeEligibility(input, policyRules);

    expect(result.calculationSteps.length).toBe(4); // steps 1-4 only
  });

  it('stops at gross income test failure (5 steps)', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 3000, frequency: 'monthly', source: 'job', verified: true },
      ],
    });
    const result = computeEligibility(input, policyRules);

    expect(result.calculationSteps.length).toBe(5); // steps 1-5 only
  });

  it('cites multiple rule IDs', () => {
    const input = makeInput();
    const result = computeEligibility(input, policyRules);

    expect(result.citedRules).toContain('ELIG-GROSS-001');
    expect(result.citedRules).toContain('INC-CONV-001');
    expect(result.citedRules).toContain('DED-STD-001');
    expect(result.citedRules).toContain('BEN-ALLOT-001');
    expect(result.citedRules).toContain('BEN-CALC-001');
  });

  it('sets expeditedEligible to false (M3 scope)', () => {
    const input = makeInput();
    const result = computeEligibility(input, policyRules);
    expect(result.expeditedEligible).toBe(false);
  });
});
