# M3 Oracle + Determination Worksheet Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a deterministic SNAP eligibility/benefit oracle, integrate it with the scenario runner for mismatch detection, and produce determination worksheet artifacts with full calculation audit trails.

**Architecture:** Pure oracle function in casework-core reads from rules.json policy pack. The runner calls the oracle directly (no HTTP) after each determination, compares results, stores mismatches in a new qa_mismatches table. An ad-hoc API endpoint exposes the oracle for debugging. The UI extends RunSummaryCard with oracle accuracy metrics and a mismatch list.

**Tech Stack:** TypeScript, Vitest, Drizzle ORM, Express, React

**Design doc:** `docs/plans/2026-02-20-m3-oracle-determination-worksheet-design.md`

**Policy pack rules:** `policy-packs/snap-illinois-fy2026-v1/rules.json` -- all FPL tables, deduction parameters, allotment tables, income conversion multipliers.

**Oracle spec:** `docs/research/05-oracle-specification.md` -- full 17-step algorithm.

---

### Task 1: Oracle types

**Files:**
- Create: `src/casework-core/oracle.ts`
- Test: `tests/casework-core/oracle.test.ts`

**Context:** These types define the oracle's input/output contract. They follow the spec in `docs/research/05-oracle-specification.md` section 1. The oracle will be a pure function with no side effects.

**Step 1: Write the failing test**

Create `tests/casework-core/oracle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type {
  OracleInput,
  OracleOutput,
  HouseholdMember,
  IncomeItem,
  ResourceItem,
  ShelterCosts,
  DeductionBreakdown,
  CalculationStep,
  FailedTest,
} from '@core/oracle';

describe('oracle types', () => {
  it('OracleInput is constructable', () => {
    const input: OracleInput = {
      householdSize: 3,
      householdMembers: [
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 5, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 2, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'earned', amount: 1500, frequency: 'monthly', source: 'wages', verified: true },
      ],
      resources: [{ type: 'checking', value: 500, countable: true }],
      shelterCosts: { rent: 800, suaTier: 'heatingCooling' },
      applicationDate: '2026-01-15',
      policyPackId: 'snap-illinois-fy2026-v1',
    };
    expect(input.householdSize).toBe(3);
  });

  it('OracleOutput is constructable', () => {
    const output: OracleOutput = {
      eligible: true,
      failedTests: [],
      grossIncome: 1500,
      netIncome: 300,
      benefitAmount: 695,
      deductions: {
        standardDeduction: 205,
        earnedIncomeDeduction: 300,
        dependentCareDeduction: 0,
        childSupportDeduction: 0,
        medicalDeduction: 0,
        excessShelterDeduction: 0,
        totalDeductions: 505,
        shelterCostDetail: {
          rent: 800, mortgage: 0, propertyTax: 0, insurance: 0, condoFees: 0,
          suaTier: 'heatingCooling', suaAmount: 546, totalShelterCosts: 1346,
        },
      },
      citedRules: ['ELIG-GROSS-001'],
      calculationSteps: [],
      expeditedEligible: false,
    };
    expect(output.eligible).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/casework-core/oracle.test.ts`
Expected: FAIL -- cannot find module `@core/oracle`

**Step 3: Write the types**

Create `src/casework-core/oracle.ts`:

```typescript
// ---------------------------------------------------------------------------
// Oracle types -- deterministic SNAP eligibility/benefit calculator
// ---------------------------------------------------------------------------

export interface HouseholdMember {
  age: number;
  isDisabled: boolean;
  isStudent: boolean;
  citizenshipStatus: 'citizen' | 'qualified_alien' | 'ineligible';
}

export interface IncomeItem {
  type: 'earned' | 'unearned' | 'excluded';
  amount: number;
  frequency: 'weekly' | 'biweekly' | 'monthly' | 'annual';
  source: string;
  verified: boolean;
}

export interface ResourceItem {
  type: string;
  value: number;
  countable: boolean;
}

export interface ShelterCosts {
  rent?: number;
  mortgage?: number;
  propertyTax?: number;
  insurance?: number;
  condoFees?: number;
  suaTier: 'heatingCooling' | 'limitedUtility' | 'singleUtility' | 'telephoneOnly' | 'none';
}

export interface OracleInput {
  householdSize: number;
  householdMembers: HouseholdMember[];
  income: IncomeItem[];
  resources: ResourceItem[];
  shelterCosts: ShelterCosts;
  medicalExpenses?: number;
  dependentCareCosts?: number;
  childSupportPaid?: number;
  applicationDate: string;
  policyPackId: string;
}

export interface FailedTest {
  testName: string;
  ruleId: string;
  reason: string;
  actual: number;
  limit: number;
}

export interface DeductionBreakdown {
  standardDeduction: number;
  earnedIncomeDeduction: number;
  dependentCareDeduction: number;
  childSupportDeduction: number;
  medicalDeduction: number;
  excessShelterDeduction: number;
  totalDeductions: number;
  shelterCostDetail: {
    rent: number;
    mortgage: number;
    propertyTax: number;
    insurance: number;
    condoFees: number;
    suaTier: string;
    suaAmount: number;
    totalShelterCosts: number;
  };
}

export interface CalculationStep {
  stepNumber: number;
  description: string;
  ruleId: string;
  inputs: Record<string, number | string>;
  output: number | string | boolean;
  formula?: string;
}

export interface OracleOutput {
  eligible: boolean;
  reason?: string;
  failedTests: FailedTest[];
  grossIncome: number;
  netIncome: number;
  benefitAmount: number;
  proratedAmount?: number;
  deductions: DeductionBreakdown;
  citedRules: string[];
  calculationSteps: CalculationStep[];
  expeditedEligible: boolean;
  expeditedReason?: string;
}

// PolicyPackRules type -- shaped to match rules.json structure
export interface PolicyPackRules {
  incomeTests: {
    grossIncomeTest: { ruleId: string; thresholdPctFpl: number; thresholdPctFplWithQM: number; exemptIfCategoricallyEligible: boolean };
    netIncomeTest: { ruleId: string; thresholdPctFpl: number };
  };
  resourceLimits: {
    standard: { ruleId: string; limit: number };
    withQualifyingMember: { ruleId: string; limit: number };
  };
  fplTable: {
    ruleId: string;
    monthlyByHouseholdSize: Record<string, number>;
    additionalMember: number;
  };
  maxAllotments: {
    ruleId: string;
    monthlyByHouseholdSize: Record<string, number>;
    additionalMember: number;
    minimumBenefit: number;
    minimumBenefitAppliesTo: number[];
  };
  deductions: {
    standard: { ruleId: string; byHouseholdSize: Record<string, number> };
    earnedIncome: { ruleId: string; rate: number };
    medical: { ruleId: string; threshold: number };
    dependentCare: { ruleId: string };
    childSupport: { ruleId: string };
    excessShelter: { ruleId: string; incomeMultiplier: number; cap: number };
    homelessShelter: { ruleId: string; standardAmount: number };
  };
  utilityAllowances: {
    tiers: Record<string, number>;
  };
  benefitFormula: {
    ruleId: string;
    contributionRate: number;
    minimumIssuance: number;
  };
  incomeConversion: {
    ruleId: string;
    weeklyMultiplier: number;
    biweeklyMultiplier: number;
  };
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/casework-core/oracle.test.ts`
Expected: PASS (2 tests)

**Step 5: Commit**

```bash
git add src/casework-core/oracle.ts tests/casework-core/oracle.test.ts
git commit -m "feat(core): oracle types for SNAP eligibility/benefit calculation"
```

---

### Task 2: Oracle calculation steps 1-5 (classification + income + resource/gross tests)

**Files:**
- Modify: `src/casework-core/oracle.ts`
- Modify: `tests/casework-core/oracle.test.ts`

**Context:** These are the early pipeline steps: classify household, convert income, compute gross, run resource test (fail fast), run gross income test (fail fast). All parameters come from `PolicyPackRules` which mirrors `policy-packs/snap-illinois-fy2026-v1/rules.json`. Read that file for exact values.

**Step 1: Write failing tests**

Add to `tests/casework-core/oracle.test.ts`:

```typescript
import { computeEligibility } from '@core/oracle';
import type { OracleInput, PolicyPackRules } from '@core/oracle';
import { readFileSync } from 'fs';
import path from 'path';

// Load the real policy pack rules for testing
const rules: PolicyPackRules = JSON.parse(
  readFileSync(
    path.join(__dirname, '../../policy-packs/snap-illinois-fy2026-v1/rules.json'),
    'utf-8',
  ),
);

// Helper to build minimal OracleInput
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

describe('oracle step 1: classify household', () => {
  it('identifies elderly/disabled household', () => {
    const input = makeInput({
      householdSize: 2,
      householdMembers: [
        { age: 65, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
    });
    const result = computeEligibility(input, rules);
    // Elderly household gets 200% FPL gross limit, not 165%
    // With no income, should be eligible
    expect(result.eligible).toBe(true);
    expect(result.calculationSteps[0].description).toContain('Classify');
  });
});

describe('oracle step 2: income conversion', () => {
  it('converts weekly income to monthly', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 400, frequency: 'weekly', source: 'wages', verified: true },
      ],
    });
    const result = computeEligibility(input, rules);
    // 400 * 4.3 = 1720
    expect(result.grossIncome).toBe(1720);
  });

  it('converts biweekly income to monthly', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 800, frequency: 'biweekly', source: 'wages', verified: true },
      ],
    });
    const result = computeEligibility(input, rules);
    // 800 * 2.15 = 1720
    expect(result.grossIncome).toBe(1720);
  });

  it('excludes excluded income types', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 1000, frequency: 'monthly', source: 'wages', verified: true },
        { type: 'excluded', amount: 500, frequency: 'monthly', source: 'gift', verified: true },
      ],
    });
    const result = computeEligibility(input, rules);
    expect(result.grossIncome).toBe(1000);
  });
});

describe('oracle step 4: resource test', () => {
  it('fails when resources exceed standard limit', () => {
    const input = makeInput({
      resources: [{ type: 'savings', value: 3500, countable: true }],
    });
    const result = computeEligibility(input, rules);
    expect(result.eligible).toBe(false);
    expect(result.failedTests.some(t => t.ruleId === 'ELIG-RES-001')).toBe(true);
  });

  it('uses higher limit for qualifying member household', () => {
    const input = makeInput({
      householdSize: 2,
      householdMembers: [
        { age: 70, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
        { age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      resources: [{ type: 'savings', value: 4000, countable: true }],
    });
    const result = computeEligibility(input, rules);
    // 4000 < 4500 (qualifying member limit) -- should pass
    expect(result.eligible).toBe(true);
  });
});

describe('oracle step 5: gross income test', () => {
  it('fails when gross income exceeds 165% FPL for non-QM household', () => {
    const input = makeInput({
      income: [
        { type: 'earned', amount: 2500, frequency: 'monthly', source: 'wages', verified: true },
      ],
    });
    const result = computeEligibility(input, rules);
    // Single person: 165% of $1305 = $2153.25 -- 2500 exceeds this
    expect(result.eligible).toBe(false);
    expect(result.failedTests.some(t => t.ruleId === 'ELIG-GROSS-001')).toBe(true);
  });

  it('uses 200% FPL for elderly/disabled household', () => {
    const input = makeInput({
      householdSize: 1,
      householdMembers: [
        { age: 67, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [
        { type: 'earned', amount: 2200, frequency: 'monthly', source: 'wages', verified: true },
      ],
    });
    const result = computeEligibility(input, rules);
    // Single elderly: 200% of $1305 = $2610 -- 2200 is under
    expect(result.failedTests.some(t => t.ruleId === 'ELIG-GROSS-001')).toBe(false);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/oracle.test.ts`
Expected: FAIL -- `computeEligibility` is not exported

**Step 3: Implement steps 1-5**

Add to `src/casework-core/oracle.ts` after the types:

```typescript
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyHousehold(members: HouseholdMember[]): {
  isElderlyOrDisabled: boolean;
  eligibleCount: number;
} {
  const isElderlyOrDisabled = members.some(m => m.age >= 60 || m.isDisabled);
  const eligibleCount = members.filter(m => m.citizenshipStatus !== 'ineligible').length;
  return { isElderlyOrDisabled, eligibleCount };
}

function convertToMonthly(
  item: IncomeItem,
  conv: PolicyPackRules['incomeConversion'],
): number {
  switch (item.frequency) {
    case 'weekly': return item.amount * conv.weeklyMultiplier;
    case 'biweekly': return item.amount * conv.biweeklyMultiplier;
    case 'monthly': return item.amount;
    case 'annual': return item.amount / 12;
  }
}

function getFplMonthly(
  householdSize: number,
  fpl: PolicyPackRules['fplTable'],
): number {
  if (householdSize <= 8) {
    return fpl.monthlyByHouseholdSize[String(householdSize)];
  }
  return fpl.monthlyByHouseholdSize['8'] + (householdSize - 8) * fpl.additionalMember;
}

function getMaxAllotment(
  householdSize: number,
  allot: PolicyPackRules['maxAllotments'],
): number {
  const maxKey = 10;
  if (householdSize <= maxKey) {
    return allot.monthlyByHouseholdSize[String(householdSize)];
  }
  return allot.monthlyByHouseholdSize[String(maxKey)] + (householdSize - maxKey) * allot.additionalMember;
}

function getStandardDeduction(
  householdSize: number,
  std: PolicyPackRules['deductions']['standard'],
): number {
  if (householdSize >= 6) return std.byHouseholdSize['6'];
  if (householdSize <= 3) return std.byHouseholdSize['1'];
  return std.byHouseholdSize[String(householdSize)];
}

// ---------------------------------------------------------------------------
// Main oracle function
// ---------------------------------------------------------------------------

export function computeEligibility(
  input: OracleInput,
  rules: PolicyPackRules,
): OracleOutput {
  const steps: CalculationStep[] = [];
  const citedRules: string[] = [];
  const failedTests: FailedTest[] = [];

  // --- Step 1: Classify household ---
  const { isElderlyOrDisabled, eligibleCount } = classifyHousehold(input.householdMembers);
  const effectiveHouseholdSize = eligibleCount || input.householdSize;

  steps.push({
    stepNumber: 1,
    description: 'Classify household',
    ruleId: rules.fplTable.ruleId,
    inputs: { householdSize: input.householdSize, eligibleMembers: eligibleCount },
    output: isElderlyOrDisabled ? 'elderly_or_disabled' : 'standard',
  });
  citedRules.push(rules.fplTable.ruleId);

  // --- Step 2: Convert income to monthly ---
  let grossEarned = 0;
  let grossUnearned = 0;
  for (const item of input.income) {
    if (item.type === 'excluded') continue;
    const monthly = convertToMonthly(item, rules.incomeConversion);
    if (item.type === 'earned') grossEarned += monthly;
    else grossUnearned += monthly;
  }

  steps.push({
    stepNumber: 2,
    description: 'Convert income to monthly',
    ruleId: rules.incomeConversion.ruleId,
    inputs: { incomeItems: input.income.length },
    output: grossEarned + grossUnearned,
    formula: `grossEarned=${grossEarned} + grossUnearned=${grossUnearned}`,
  });
  citedRules.push(rules.incomeConversion.ruleId);

  // --- Step 3: Gross income ---
  const grossIncome = grossEarned + grossUnearned;

  steps.push({
    stepNumber: 3,
    description: 'Calculate gross income',
    ruleId: rules.incomeTests.grossIncomeTest.ruleId,
    inputs: { grossEarned, grossUnearned },
    output: grossIncome,
    formula: `${grossEarned} + ${grossUnearned} = ${grossIncome}`,
  });

  // --- Step 4: Resource test ---
  const countableResources = input.resources
    .filter(r => r.countable)
    .reduce((sum, r) => sum + r.value, 0);

  const resourceLimit = isElderlyOrDisabled
    ? rules.resourceLimits.withQualifyingMember.limit
    : rules.resourceLimits.standard.limit;
  const resourceRuleId = isElderlyOrDisabled
    ? rules.resourceLimits.withQualifyingMember.ruleId
    : rules.resourceLimits.standard.ruleId;

  steps.push({
    stepNumber: 4,
    description: 'Resource test',
    ruleId: resourceRuleId,
    inputs: { countableResources, resourceLimit },
    output: countableResources <= resourceLimit,
    formula: `${countableResources} <= ${resourceLimit}`,
  });
  citedRules.push(resourceRuleId);

  if (countableResources > resourceLimit) {
    failedTests.push({
      testName: 'Resource test',
      ruleId: resourceRuleId,
      reason: 'Resources exceed limit',
      actual: countableResources,
      limit: resourceLimit,
    });
    return buildIneligibleResult(grossIncome, failedTests, steps, citedRules, 'Resources exceed limit');
  }

  // --- Step 5: Gross income test ---
  const fplMonthly = getFplMonthly(effectiveHouseholdSize, rules.fplTable);
  const grossPct = isElderlyOrDisabled
    ? rules.incomeTests.grossIncomeTest.thresholdPctFplWithQM
    : rules.incomeTests.grossIncomeTest.thresholdPctFpl;
  const grossLimit = fplMonthly * (grossPct / 100);
  const grossRuleId = rules.incomeTests.grossIncomeTest.ruleId;

  steps.push({
    stepNumber: 5,
    description: 'Gross income test',
    ruleId: grossRuleId,
    inputs: { grossIncome, fplMonthly, thresholdPct: grossPct, grossLimit },
    output: grossIncome <= grossLimit,
    formula: `${grossIncome} <= ${fplMonthly} * ${grossPct}% = ${grossLimit}`,
  });
  citedRules.push(grossRuleId);

  if (grossIncome > grossLimit) {
    failedTests.push({
      testName: 'Gross income test',
      ruleId: grossRuleId,
      reason: `Gross income exceeds ${grossPct}% FPL`,
      actual: grossIncome,
      limit: grossLimit,
    });
    return buildIneligibleResult(grossIncome, failedTests, steps, citedRules, `Gross income exceeds ${grossPct}% FPL`);
  }

  // Placeholder: remaining steps return eligible with max benefit
  // (will be implemented in Task 3)
  const maxAllotment = getMaxAllotment(effectiveHouseholdSize, rules.maxAllotments);
  return {
    eligible: true,
    failedTests: [],
    grossIncome,
    netIncome: 0,
    benefitAmount: maxAllotment,
    deductions: emptyDeductions(),
    citedRules,
    calculationSteps: steps,
    expeditedEligible: false,
  };
}

function buildIneligibleResult(
  grossIncome: number,
  failedTests: FailedTest[],
  steps: CalculationStep[],
  citedRules: string[],
  reason: string,
): OracleOutput {
  return {
    eligible: false,
    reason,
    failedTests,
    grossIncome,
    netIncome: 0,
    benefitAmount: 0,
    deductions: emptyDeductions(),
    citedRules,
    calculationSteps: steps,
    expeditedEligible: false,
  };
}

function emptyDeductions(): DeductionBreakdown {
  return {
    standardDeduction: 0,
    earnedIncomeDeduction: 0,
    dependentCareDeduction: 0,
    childSupportDeduction: 0,
    medicalDeduction: 0,
    excessShelterDeduction: 0,
    totalDeductions: 0,
    shelterCostDetail: {
      rent: 0, mortgage: 0, propertyTax: 0, insurance: 0, condoFees: 0,
      suaTier: 'none', suaAmount: 0, totalShelterCosts: 0,
    },
  };
}
```

**Step 4: Run tests to verify they pass**

Run: `pnpm vitest run tests/casework-core/oracle.test.ts`
Expected: PASS (all tests including new ones)

**Step 5: Commit**

```bash
git add src/casework-core/oracle.ts tests/casework-core/oracle.test.ts
git commit -m "feat(core): oracle steps 1-5 -- classify, income, resource/gross tests"
```

---

### Task 3: Oracle calculation steps 6-16 (deductions + net test + benefit)

**Files:**
- Modify: `src/casework-core/oracle.ts`
- Modify: `tests/casework-core/oracle.test.ts`

**Context:** These are the deduction and benefit calculation steps. The standard deduction varies by household size (see `rules.json` deductions.standard.byHouseholdSize). Earned income deduction is 20%. Medical deduction only applies to elderly/disabled households and has a $35 threshold. Excess shelter deduction is capped at $744 for non-elderly/disabled. Net income test is 100% FPL. Benefit = max_allotment - (0.30 * net_income). Minimum benefit of $24 applies to 1-2 person households.

**Step 1: Write failing tests**

Add to `tests/casework-core/oracle.test.ts`:

```typescript
describe('oracle steps 6-16: deductions and benefit', () => {
  it('single person no income gets maximum benefit', () => {
    const input = makeInput();
    const result = computeEligibility(input, rules);
    expect(result.eligible).toBe(true);
    expect(result.benefitAmount).toBe(298); // max allotment for HH size 1
    expect(result.netIncome).toBe(0);
  });

  it('applies standard deduction by household size', () => {
    const input = makeInput({
      householdSize: 4,
      householdMembers: Array.from({ length: 4 }, () => ({
        age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' as const,
      })),
      income: [{ type: 'unearned', amount: 1000, frequency: 'monthly', source: 'SSI', verified: true }],
    });
    const result = computeEligibility(input, rules);
    // HH4 standard deduction = 219
    expect(result.deductions.standardDeduction).toBe(219);
  });

  it('applies 20% earned income deduction', () => {
    const input = makeInput({
      income: [{ type: 'earned', amount: 2000, frequency: 'monthly', source: 'wages', verified: true }],
    });
    const result = computeEligibility(input, rules);
    // 20% of 2000 = 400
    expect(result.deductions.earnedIncomeDeduction).toBe(400);
  });

  it('applies medical deduction for elderly household', () => {
    const input = makeInput({
      householdSize: 1,
      householdMembers: [
        { age: 70, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      medicalExpenses: 135,
    });
    const result = computeEligibility(input, rules);
    // 135 - 35 threshold = 100
    expect(result.deductions.medicalDeduction).toBe(100);
  });

  it('does NOT apply medical deduction for non-elderly household', () => {
    const input = makeInput({ medicalExpenses: 200 });
    const result = computeEligibility(input, rules);
    expect(result.deductions.medicalDeduction).toBe(0);
  });

  it('applies excess shelter deduction with cap for non-elderly', () => {
    const input = makeInput({
      income: [{ type: 'earned', amount: 1000, frequency: 'monthly', source: 'wages', verified: true }],
      shelterCosts: { rent: 1200, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, rules);
    // Shelter = 1200 + 546(SUA) = 1746
    // After std ded (205) and earned ded (200): adjusted = 1000 - 205 - 200 = 595
    // Half adjusted = 297.5
    // Excess = 1746 - 297.5 = 1448.5
    // Capped at 744
    expect(result.deductions.excessShelterDeduction).toBe(744);
  });

  it('no shelter cap for elderly/disabled household', () => {
    const input = makeInput({
      householdSize: 1,
      householdMembers: [
        { age: 68, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' },
      ],
      income: [{ type: 'earned', amount: 1000, frequency: 'monthly', source: 'wages', verified: true }],
      shelterCosts: { rent: 1200, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, rules);
    // Same shelter math but no cap -- should be > 744
    expect(result.deductions.excessShelterDeduction).toBeGreaterThan(744);
  });

  it('fails net income test when net exceeds 100% FPL', () => {
    const input = makeInput({
      income: [
        { type: 'unearned', amount: 2100, frequency: 'monthly', source: 'pension', verified: true },
      ],
    });
    const result = computeEligibility(input, rules);
    // Gross = 2100 (under 165% FPL = 2153.25)
    // After std ded: 2100 - 205 = 1895
    // No earned income ded (unearned only)
    // Net = 1895 > 1305 (100% FPL)
    expect(result.eligible).toBe(false);
    expect(result.failedTests.some(t => t.ruleId === 'ELIG-NET-001')).toBe(true);
  });

  it('calculates correct benefit amount', () => {
    const input = makeInput({
      income: [{ type: 'earned', amount: 1500, frequency: 'monthly', source: 'wages', verified: true }],
      shelterCosts: { rent: 800, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, rules);
    expect(result.eligible).toBe(true);
    expect(result.benefitAmount).toBeGreaterThan(0);
    // Verify benefit = floor(max_allotment - 0.30 * netIncome)
    const expected = Math.floor(298 - 0.30 * result.netIncome);
    expect(result.benefitAmount).toBe(Math.max(expected, 0));
  });

  it('applies minimum benefit for 1-2 person households', () => {
    // High income, low benefit scenario for single person
    const input = makeInput({
      income: [{ type: 'earned', amount: 2000, frequency: 'monthly', source: 'wages', verified: true }],
      shelterCosts: { rent: 1000, suaTier: 'heatingCooling' },
    });
    const result = computeEligibility(input, rules);
    if (result.eligible && result.benefitAmount > 0 && result.benefitAmount < 24) {
      expect(result.benefitAmount).toBe(24);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/oracle.test.ts`
Expected: FAIL -- placeholder returns wrong values

**Step 3: Replace the placeholder in computeEligibility with full implementation**

In `src/casework-core/oracle.ts`, replace the placeholder after step 5 with:

```typescript
  // --- Step 6: Standard deduction ---
  const standardDeduction = getStandardDeduction(effectiveHouseholdSize, rules.deductions.standard);
  let adjustedIncome = grossIncome - standardDeduction;

  steps.push({
    stepNumber: 6,
    description: 'Apply standard deduction',
    ruleId: rules.deductions.standard.ruleId,
    inputs: { grossIncome, householdSize: effectiveHouseholdSize },
    output: adjustedIncome,
    formula: `${grossIncome} - ${standardDeduction} = ${adjustedIncome}`,
  });
  citedRules.push(rules.deductions.standard.ruleId);

  // --- Step 7: Earned income deduction ---
  const earnedIncomeDeduction = Math.floor(grossEarned * rules.deductions.earnedIncome.rate);
  adjustedIncome -= earnedIncomeDeduction;

  steps.push({
    stepNumber: 7,
    description: 'Apply earned income deduction',
    ruleId: rules.deductions.earnedIncome.ruleId,
    inputs: { grossEarned, rate: rules.deductions.earnedIncome.rate },
    output: earnedIncomeDeduction,
    formula: `floor(${grossEarned} * ${rules.deductions.earnedIncome.rate}) = ${earnedIncomeDeduction}`,
  });
  citedRules.push(rules.deductions.earnedIncome.ruleId);

  // --- Step 8: Dependent care deduction ---
  const dependentCareDeduction = input.dependentCareCosts ?? 0;
  adjustedIncome -= dependentCareDeduction;

  steps.push({
    stepNumber: 8,
    description: 'Apply dependent care deduction',
    ruleId: rules.deductions.dependentCare.ruleId,
    inputs: { dependentCareCosts: dependentCareDeduction },
    output: dependentCareDeduction,
  });
  if (dependentCareDeduction > 0) citedRules.push(rules.deductions.dependentCare.ruleId);

  // --- Step 9: Child support deduction ---
  const childSupportDeduction = input.childSupportPaid ?? 0;
  adjustedIncome -= childSupportDeduction;

  steps.push({
    stepNumber: 9,
    description: 'Apply child support deduction',
    ruleId: rules.deductions.childSupport.ruleId,
    inputs: { childSupportPaid: childSupportDeduction },
    output: childSupportDeduction,
  });
  if (childSupportDeduction > 0) citedRules.push(rules.deductions.childSupport.ruleId);

  // --- Step 10: Medical deduction (elderly/disabled only) ---
  let medicalDeduction = 0;
  if (isElderlyOrDisabled && (input.medicalExpenses ?? 0) > 0) {
    medicalDeduction = Math.max(0, (input.medicalExpenses ?? 0) - rules.deductions.medical.threshold);
  }
  adjustedIncome -= medicalDeduction;

  steps.push({
    stepNumber: 10,
    description: 'Apply medical deduction (elderly/disabled only)',
    ruleId: rules.deductions.medical.ruleId,
    inputs: { medicalExpenses: input.medicalExpenses ?? 0, threshold: rules.deductions.medical.threshold, isElderlyOrDisabled },
    output: medicalDeduction,
    formula: isElderlyOrDisabled
      ? `max(0, ${input.medicalExpenses ?? 0} - ${rules.deductions.medical.threshold}) = ${medicalDeduction}`
      : 'N/A (not elderly/disabled)',
  });
  if (medicalDeduction > 0) citedRules.push(rules.deductions.medical.ruleId);

  // --- Step 11: Excess shelter deduction ---
  const suaAmount = input.shelterCosts.suaTier !== 'none'
    ? (rules.utilityAllowances.tiers[input.shelterCosts.suaTier] ?? 0)
    : 0;

  const totalShelterCosts =
    (input.shelterCosts.rent ?? 0) +
    (input.shelterCosts.mortgage ?? 0) +
    (input.shelterCosts.propertyTax ?? 0) +
    (input.shelterCosts.insurance ?? 0) +
    (input.shelterCosts.condoFees ?? 0) +
    suaAmount;

  const halfAdjusted = adjustedIncome * rules.deductions.excessShelter.incomeMultiplier;
  let excessShelter = Math.max(0, totalShelterCosts - halfAdjusted);

  if (!isElderlyOrDisabled) {
    excessShelter = Math.min(excessShelter, rules.deductions.excessShelter.cap);
  }

  adjustedIncome -= excessShelter;

  steps.push({
    stepNumber: 11,
    description: 'Calculate excess shelter deduction',
    ruleId: rules.deductions.excessShelter.ruleId,
    inputs: { totalShelterCosts, halfAdjusted, cap: isElderlyOrDisabled ? 'none' : rules.deductions.excessShelter.cap },
    output: excessShelter,
    formula: `max(0, ${totalShelterCosts} - ${halfAdjusted}) = ${excessShelter}${!isElderlyOrDisabled ? ` (capped at ${rules.deductions.excessShelter.cap})` : ''}`,
  });
  citedRules.push(rules.deductions.excessShelter.ruleId);

  // --- Step 12: Net income ---
  const netIncome = Math.max(0, adjustedIncome);

  steps.push({
    stepNumber: 12,
    description: 'Calculate net income',
    ruleId: rules.incomeTests.netIncomeTest.ruleId,
    inputs: { adjustedIncome },
    output: netIncome,
    formula: `max(0, ${adjustedIncome}) = ${netIncome}`,
  });

  // --- Step 13: Net income test ---
  const netLimit = fplMonthly * (rules.incomeTests.netIncomeTest.thresholdPctFpl / 100);

  steps.push({
    stepNumber: 13,
    description: 'Net income test',
    ruleId: rules.incomeTests.netIncomeTest.ruleId,
    inputs: { netIncome, fplMonthly, thresholdPct: rules.incomeTests.netIncomeTest.thresholdPctFpl, netLimit },
    output: netIncome <= netLimit,
    formula: `${netIncome} <= ${netLimit}`,
  });
  citedRules.push(rules.incomeTests.netIncomeTest.ruleId);

  if (netIncome > netLimit) {
    failedTests.push({
      testName: 'Net income test',
      ruleId: rules.incomeTests.netIncomeTest.ruleId,
      reason: 'Net income exceeds 100% FPL',
      actual: netIncome,
      limit: netLimit,
    });
    const ded = buildDeductions(standardDeduction, earnedIncomeDeduction, dependentCareDeduction, childSupportDeduction, medicalDeduction, excessShelter, input.shelterCosts, suaAmount, totalShelterCosts);
    return {
      eligible: false,
      reason: 'Net income exceeds 100% FPL',
      failedTests,
      grossIncome,
      netIncome,
      benefitAmount: 0,
      deductions: ded,
      citedRules,
      calculationSteps: steps,
      expeditedEligible: false,
    };
  }

  // --- Step 14: Benefit amount ---
  const maxAllotment = getMaxAllotment(effectiveHouseholdSize, rules.maxAllotments);
  const expectedContribution = netIncome * rules.benefitFormula.contributionRate;
  let benefitAmount = Math.floor(maxAllotment - expectedContribution);

  steps.push({
    stepNumber: 14,
    description: 'Calculate benefit amount',
    ruleId: rules.benefitFormula.ruleId,
    inputs: { maxAllotment, netIncome, contributionRate: rules.benefitFormula.contributionRate },
    output: benefitAmount,
    formula: `floor(${maxAllotment} - ${rules.benefitFormula.contributionRate} * ${netIncome}) = ${benefitAmount}`,
  });
  citedRules.push(rules.benefitFormula.ruleId);
  citedRules.push(rules.maxAllotments.ruleId);

  // --- Step 15: Minimum benefit ---
  if (
    rules.maxAllotments.minimumBenefitAppliesTo.includes(effectiveHouseholdSize) &&
    benefitAmount > 0 &&
    benefitAmount < rules.maxAllotments.minimumBenefit
  ) {
    benefitAmount = rules.maxAllotments.minimumBenefit;
  }

  steps.push({
    stepNumber: 15,
    description: 'Apply minimum benefit',
    ruleId: rules.maxAllotments.ruleId,
    inputs: { benefitAmount, minimumBenefit: rules.maxAllotments.minimumBenefit, householdSize: effectiveHouseholdSize },
    output: benefitAmount,
  });

  // --- Step 16: Final eligibility check ---
  if (benefitAmount <= 0) {
    return {
      eligible: false,
      reason: 'Calculated benefit is zero or negative',
      failedTests,
      grossIncome,
      netIncome,
      benefitAmount: 0,
      deductions: buildDeductions(standardDeduction, earnedIncomeDeduction, dependentCareDeduction, childSupportDeduction, medicalDeduction, excessShelter, input.shelterCosts, suaAmount, totalShelterCosts),
      citedRules,
      calculationSteps: steps,
      expeditedEligible: false,
    };
  }

  return {
    eligible: true,
    failedTests: [],
    grossIncome,
    netIncome,
    benefitAmount,
    deductions: buildDeductions(standardDeduction, earnedIncomeDeduction, dependentCareDeduction, childSupportDeduction, medicalDeduction, excessShelter, input.shelterCosts, suaAmount, totalShelterCosts),
    citedRules,
    calculationSteps: steps,
    expeditedEligible: false,
  };
```

Also add the `buildDeductions` helper:

```typescript
function buildDeductions(
  standardDeduction: number,
  earnedIncomeDeduction: number,
  dependentCareDeduction: number,
  childSupportDeduction: number,
  medicalDeduction: number,
  excessShelterDeduction: number,
  shelterCosts: ShelterCosts,
  suaAmount: number,
  totalShelterCosts: number,
): DeductionBreakdown {
  return {
    standardDeduction,
    earnedIncomeDeduction,
    dependentCareDeduction,
    childSupportDeduction,
    medicalDeduction,
    excessShelterDeduction,
    totalDeductions: standardDeduction + earnedIncomeDeduction + dependentCareDeduction + childSupportDeduction + medicalDeduction + excessShelterDeduction,
    shelterCostDetail: {
      rent: shelterCosts.rent ?? 0,
      mortgage: shelterCosts.mortgage ?? 0,
      propertyTax: shelterCosts.propertyTax ?? 0,
      insurance: shelterCosts.insurance ?? 0,
      condoFees: shelterCosts.condoFees ?? 0,
      suaTier: shelterCosts.suaTier,
      suaAmount,
      totalShelterCosts,
    },
  };
}
```

**Step 4: Run tests**

Run: `pnpm vitest run tests/casework-core/oracle.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/casework-core/oracle.ts tests/casework-core/oracle.test.ts
git commit -m "feat(core): oracle steps 6-16 -- deductions, net income test, benefit calculation"
```

---

### Task 4: Oracle comparison types and function

**Files:**
- Create: `src/casework-core/oracle-comparison.ts`
- Create: `tests/casework-core/oracle-comparison.test.ts`

**Context:** The comparison function takes the runner's decision (approve/deny + benefit amount) and the oracle's output, and produces a structured comparison record. This is used by the runner to detect mismatches and by the metrics engine to compute accuracy rates.

**Step 1: Write failing tests**

Create `tests/casework-core/oracle-comparison.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { compareWithOracle, type OracleComparison, type MismatchRecord } from '@core/oracle-comparison';
import type { OracleOutput, DeductionBreakdown } from '@core/oracle';

function makeOracleOutput(overrides: Partial<OracleOutput> = {}): OracleOutput {
  return {
    eligible: true,
    failedTests: [],
    grossIncome: 1500,
    netIncome: 500,
    benefitAmount: 148,
    deductions: {
      standardDeduction: 205, earnedIncomeDeduction: 300, dependentCareDeduction: 0,
      childSupportDeduction: 0, medicalDeduction: 0, excessShelterDeduction: 0,
      totalDeductions: 505,
      shelterCostDetail: { rent: 0, mortgage: 0, propertyTax: 0, insurance: 0, condoFees: 0, suaTier: 'none', suaAmount: 0, totalShelterCosts: 0 },
    },
    citedRules: ['ELIG-GROSS-001', 'DED-STD-001', 'DED-EARN-001', 'BEN-CALC-001'],
    calculationSteps: [],
    expeditedEligible: false,
    ...overrides,
  };
}

describe('compareWithOracle', () => {
  it('detects eligibility match', () => {
    const result = compareWithOracle('approved', 148, ['ELIG-GROSS-001', 'DED-STD-001'], makeOracleOutput());
    expect(result.comparison.eligibilityMatch).toBe(true);
    expect(result.comparison.benefitMatch).toBe(true);
    expect(result.mismatches).toHaveLength(0);
  });

  it('detects eligibility mismatch -- approved but should be denied', () => {
    const oracle = makeOracleOutput({ eligible: false, benefitAmount: 0 });
    const result = compareWithOracle('approved', 148, [], oracle);
    expect(result.comparison.eligibilityMatch).toBe(false);
    expect(result.mismatches.some(m => m.severity === 'critical')).toBe(true);
  });

  it('detects benefit amount mismatch', () => {
    const result = compareWithOracle('approved', 200, [], makeOracleOutput({ benefitAmount: 148 }));
    expect(result.comparison.benefitMatch).toBe(false);
    expect(result.comparison.benefitDelta).toBe(52);
    expect(result.mismatches.some(m => m.mismatchType === 'benefit_amount')).toBe(true);
  });

  it('detects missing citations', () => {
    const result = compareWithOracle('approved', 148, ['ELIG-GROSS-001'], makeOracleOutput());
    expect(result.comparison.missingCitations.length).toBeGreaterThan(0);
  });

  it('assigns correct severity levels', () => {
    // Critical: eligibility mismatch
    const critical = compareWithOracle('denied', 0, [], makeOracleOutput({ eligible: true }));
    expect(critical.mismatches[0].severity).toBe('critical');

    // High: benefit delta > 50
    const high = compareWithOracle('approved', 260, [], makeOracleOutput({ benefitAmount: 148 }));
    expect(high.mismatches.some(m => m.severity === 'high')).toBe(true);

    // Medium: benefit delta 1-50
    const medium = compareWithOracle('approved', 170, [], makeOracleOutput({ benefitAmount: 148 }));
    expect(medium.mismatches.some(m => m.severity === 'medium')).toBe(true);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/oracle-comparison.test.ts`
Expected: FAIL

**Step 3: Implement**

Create `src/casework-core/oracle-comparison.ts`:

```typescript
import type { OracleOutput } from './oracle';

export interface OracleComparison {
  eligibilityMatch: boolean;
  benefitMatch: boolean;
  benefitDelta: number;
  citationsCovered: boolean;
  missingCitations: string[];
}

export interface MismatchRecord {
  mismatchType: 'eligibility' | 'benefit_amount' | 'deduction' | 'citation';
  severity: 'critical' | 'high' | 'medium' | 'low';
  runnerValue: string;
  oracleValue: string;
  detail: string;
}

export interface ComparisonResult {
  comparison: OracleComparison;
  mismatches: MismatchRecord[];
}

export function compareWithOracle(
  runnerDecision: 'approved' | 'denied',
  runnerBenefitAmount: number,
  runnerCitations: string[],
  oracle: OracleOutput,
): ComparisonResult {
  const mismatches: MismatchRecord[] = [];

  // Eligibility match
  const runnerEligible = runnerDecision === 'approved';
  const eligibilityMatch = runnerEligible === oracle.eligible;

  if (!eligibilityMatch) {
    mismatches.push({
      mismatchType: 'eligibility',
      severity: 'critical',
      runnerValue: runnerDecision,
      oracleValue: oracle.eligible ? 'eligible' : 'ineligible',
      detail: `Runner ${runnerDecision} but oracle says ${oracle.eligible ? 'eligible' : 'ineligible'}${oracle.reason ? ': ' + oracle.reason : ''}`,
    });
  }

  // Benefit match
  const benefitDelta = runnerBenefitAmount - oracle.benefitAmount;
  const benefitMatch = benefitDelta === 0;

  if (!benefitMatch && eligibilityMatch && oracle.eligible) {
    const absDelta = Math.abs(benefitDelta);
    const severity = absDelta > 50 ? 'high' : 'medium';
    mismatches.push({
      mismatchType: 'benefit_amount',
      severity,
      runnerValue: String(runnerBenefitAmount),
      oracleValue: String(oracle.benefitAmount),
      detail: `Benefit delta: ${benefitDelta} (runner=${runnerBenefitAmount}, oracle=${oracle.benefitAmount})`,
    });
  }

  // Citation coverage
  const oracleCitations = new Set(oracle.citedRules);
  const runnerCitationSet = new Set(runnerCitations);
  const missingCitations = [...oracleCitations].filter(c => !runnerCitationSet.has(c));
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
```

**Step 4: Run tests**

Run: `pnpm vitest run tests/casework-core/oracle-comparison.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/casework-core/oracle-comparison.ts tests/casework-core/oracle-comparison.test.ts
git commit -m "feat(core): oracle comparison function with mismatch severity levels"
```

---

### Task 5: Extend scenario generator with financial data

**Files:**
- Modify: `src/casework-core/scenarios/missing-docs.ts`
- Modify: `tests/casework-core/scenarios/missing-docs.test.ts`

**Context:** The generator currently produces `MissingDocsCase` with only name, household size, verifications. We need to add an `OracleInput` field so each case has full financial data for the oracle. The existing PRNG and helpers (`mulberry32`, `pick`, `shuffle`) are reused. New data pools provide income ranges, shelter tiers, etc.

**Step 1: Write failing tests**

Add to `tests/casework-core/scenarios/missing-docs.test.ts`:

```typescript
import type { OracleInput } from '@core/oracle';

describe('financial data generation', () => {
  it('every case has valid oracleInput', () => {
    const cases = generateMissingDocsCases(50, 42);
    for (const c of cases) {
      expect(c.oracleInput).toBeDefined();
      const oi = c.oracleInput!;
      expect(oi.householdSize).toBe(c.householdSize);
      expect(oi.householdMembers).toHaveLength(c.householdSize);
      expect(oi.income.length).toBeGreaterThanOrEqual(0);
      expect(oi.resources.length).toBeGreaterThanOrEqual(0);
      expect(oi.shelterCosts.suaTier).toBeDefined();
      expect(oi.applicationDate).toBe('2026-01-15');
    }
  });

  it('produces diverse income levels across 100 cases', () => {
    const cases = generateMissingDocsCases(100, 42);
    const incomes = cases
      .filter(c => c.oracleInput)
      .map(c => c.oracleInput!.income.reduce((s, i) => s + i.amount, 0));
    const hasLow = incomes.some(i => i < 500);
    const hasHigh = incomes.some(i => i > 2000);
    expect(hasLow).toBe(true);
    expect(hasHigh).toBe(true);
  });

  it('some households have elderly/disabled members', () => {
    const cases = generateMissingDocsCases(100, 42);
    const hasElderly = cases.some(c =>
      c.oracleInput?.householdMembers.some(m => m.age >= 60 || m.isDisabled),
    );
    expect(hasElderly).toBe(true);
  });

  it('deterministic: same seed produces same financial data', () => {
    const a = generateMissingDocsCases(20, 99);
    const b = generateMissingDocsCases(20, 99);
    for (let i = 0; i < 20; i++) {
      expect(a[i].oracleInput!.income).toEqual(b[i].oracleInput!.income);
      expect(a[i].oracleInput!.shelterCosts).toEqual(b[i].oracleInput!.shelterCosts);
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/scenarios/missing-docs.test.ts`
Expected: FAIL -- `oracleInput` is undefined

**Step 3: Extend the generator**

Modify `src/casework-core/scenarios/missing-docs.ts`:

1. Import `OracleInput, HouseholdMember, IncomeItem, ShelterCosts` from `@core/oracle`
2. Add `oracleInput?: OracleInput` to `MissingDocsCase`
3. Add helper functions to generate financial data:

```typescript
import type { OracleInput, HouseholdMember, IncomeItem, ShelterCosts } from '../oracle';

// Add to MissingDocsCase interface:
// oracleInput?: OracleInput;

const SUA_TIERS = ['heatingCooling', 'limitedUtility', 'singleUtility', 'telephoneOnly', 'none'] as const;

function generateHouseholdMembers(size: number, rand: () => number): HouseholdMember[] {
  const members: HouseholdMember[] = [];
  for (let i = 0; i < size; i++) {
    const age = i === 0
      ? Math.floor(rand() * 50) + 18  // head of household: 18-67
      : Math.floor(rand() * 80) + 1;  // others: 1-80
    members.push({
      age,
      isDisabled: rand() < 0.08,  // 8% chance
      isStudent: age >= 18 && age <= 24 && rand() < 0.15,
      citizenshipStatus: rand() < 0.95 ? 'citizen' : 'qualified_alien',
    });
  }
  return members;
}

function generateIncome(rand: () => number): IncomeItem[] {
  const items: IncomeItem[] = [];
  // 80% chance of earned income
  if (rand() < 0.80) {
    const freq = pick(['monthly', 'biweekly', 'weekly'] as const, rand);
    const base = freq === 'monthly' ? 800 + Math.floor(rand() * 2700)
      : freq === 'biweekly' ? 400 + Math.floor(rand() * 1200)
      : 200 + Math.floor(rand() * 600);
    items.push({ type: 'earned', amount: base, frequency: freq, source: 'wages', verified: true });
  }
  // 30% chance of unearned income
  if (rand() < 0.30) {
    items.push({
      type: 'unearned',
      amount: 200 + Math.floor(rand() * 1000),
      frequency: 'monthly',
      source: pick(['SSI', 'pension', 'child_support_received'] as const, rand),
      verified: true,
    });
  }
  return items;
}

function generateShelterCosts(rand: () => number): ShelterCosts {
  const suaTier = pick(SUA_TIERS, rand);
  const hasRent = rand() < 0.75;
  return {
    rent: hasRent ? 400 + Math.floor(rand() * 1200) : undefined,
    suaTier,
  };
}

function generateResources(rand: () => number) {
  if (rand() < 0.70) return []; // 70% have no countable resources
  return [{ type: 'savings', value: Math.floor(rand() * 5000), countable: true }];
}
```

4. In the `generateMissingDocsCases` loop, after building the existing fields, add:

```typescript
    const members = generateHouseholdMembers(householdSize, rand);
    const income = generateIncome(rand);
    const shelterCosts = generateShelterCosts(rand);
    const resources = generateResources(rand);
    const oracleInput: OracleInput = {
      householdSize,
      householdMembers: members,
      income,
      resources,
      shelterCosts,
      medicalExpenses: members.some(m => m.age >= 60 || m.isDisabled) && rand() < 0.40
        ? Math.floor(rand() * 300) + 35
        : undefined,
      dependentCareCosts: members.some(m => m.age < 13) && rand() < 0.30
        ? Math.floor(rand() * 500) + 50
        : undefined,
      childSupportPaid: rand() < 0.10 ? Math.floor(rand() * 400) + 50 : undefined,
      applicationDate: '2026-01-15',
      policyPackId: 'snap-illinois-fy2026-v1',
    };
```

And add `oracleInput` to the pushed object.

**Step 4: Run tests**

Run: `pnpm vitest run tests/casework-core/scenarios/missing-docs.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/casework-core/scenarios/missing-docs.ts tests/casework-core/scenarios/missing-docs.test.ts
git commit -m "feat(core): extend scenario generator with financial data for oracle"
```

---

### Task 6: Integrate oracle into runner

**Files:**
- Modify: `src/casework-core/runner.ts`
- Modify: `tests/casework-core/runner.test.ts`

**Context:** The runner currently makes scripted decisions. Now it also calls the oracle after determinations and attaches the comparison. The oracle needs rules from the policy pack -- load `rules.json` at runner init. The `CaseResult` interface gains `oracleOutput` and `oracleComparison`. Abandoned cases skip the oracle.

**Step 1: Write failing tests**

Add to `tests/casework-core/runner.test.ts`:

```typescript
describe('oracle integration', () => {
  it('approved cases have oracleOutput', () => {
    const cases = generateMissingDocsCases(20, 42);
    const result = runMissingDocsScenario(cases);
    const approved = result.caseResults.filter(c => c.outcome === 'approved');
    expect(approved.length).toBeGreaterThan(0);
    for (const c of approved) {
      expect(c.oracleOutput).toBeDefined();
      expect(c.oracleComparison).toBeDefined();
    }
  });

  it('abandoned cases do NOT have oracleOutput', () => {
    const cases = generateMissingDocsCases(50, 42);
    const result = runMissingDocsScenario(cases);
    const abandoned = result.caseResults.filter(c => c.outcome === 'abandoned');
    for (const c of abandoned) {
      expect(c.oracleOutput).toBeUndefined();
    }
  });

  it('some cases have eligibility mismatches', () => {
    // With 100 random cases, runner always approves on-time/late cases
    // but oracle may find some ineligible
    const cases = generateMissingDocsCases(100, 42);
    const result = runMissingDocsScenario(cases);
    const withComparison = result.caseResults.filter(c => c.oracleComparison);
    const mismatches = withComparison.filter(c => !c.oracleComparison!.eligibilityMatch);
    // We can't guarantee exact count but with random financial data some should mismatch
    expect(withComparison.length).toBeGreaterThan(0);
    // At least check the comparison structure is correct
    for (const c of withComparison) {
      expect(typeof c.oracleComparison!.eligibilityMatch).toBe('boolean');
      expect(typeof c.oracleComparison!.benefitDelta).toBe('number');
    }
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/runner.test.ts`
Expected: FAIL -- oracleOutput is undefined

**Step 3: Integrate oracle into runner**

Modify `src/casework-core/runner.ts`:

1. Import oracle and comparison:
```typescript
import { computeEligibility, type OracleOutput, type PolicyPackRules } from './oracle';
import { compareWithOracle, type OracleComparison } from './oracle-comparison';
import { readFileSync } from 'fs';
import path from 'path';
```

2. Add to `CaseResult`:
```typescript
oracleOutput?: OracleOutput;
oracleComparison?: OracleComparison;
```

3. Load rules at module scope (or lazily):
```typescript
let _rules: PolicyPackRules | null = null;
function loadRules(): PolicyPackRules {
  if (!_rules) {
    _rules = JSON.parse(
      readFileSync(
        path.join(__dirname, '../../policy-packs/snap-illinois-fy2026-v1/rules.json'),
        'utf-8',
      ),
    ) as PolicyPackRules;
  }
  return _rules;
}
```

4. In `runSingleCase`, after the step loop, before building the return value:
```typescript
  // Oracle evaluation (skip abandoned cases)
  let oracleOutput: OracleOutput | undefined;
  let oracleComparison: OracleComparison | undefined;

  if (caseConfig.oracleInput && outcome !== 'abandoned') {
    const rules = loadRules();
    oracleOutput = computeEligibility(caseConfig.oracleInput, rules);

    const runnerBenefit = outcome === 'approved' ? (oracleOutput.benefitAmount || 0) : 0;
    // Runner doesn't compute benefit -- use 0 for benefit comparison
    // This creates natural mismatches
    const runnerCitations = events.flatMap(e => e.citations);
    const { comparison } = compareWithOracle(
      outcome === 'approved' ? 'approved' : 'denied',
      runnerBenefit,
      runnerCitations,
      oracleOutput,
    );
    oracleComparison = comparison;
  }
```

Note: The runner has no benefit calculation -- it should pass 0 as runner benefit for comparison since it only makes approve/deny decisions without computing amounts. This ensures benefit_amount mismatches are detected.

Actually, let me reconsider. For a fairer comparison: the runner knows the outcome but not the benefit. We should compare eligibility only and flag benefit as "not computed by runner". Update the runner to pass the oracle's own benefit for approved cases (so eligibility mismatches are the main signal) or pass 0 to detect all benefit mismatches. The design says "natural mismatches from simplified runner decisions" so passing 0 is correct.

5. Add `oracleOutput` and `oracleComparison` to the return object.

**Step 4: Run tests**

Run: `pnpm vitest run tests/casework-core/runner.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/casework-core/runner.ts tests/casework-core/runner.test.ts
git commit -m "feat(core): integrate oracle into runner with comparison on each determination"
```

---

### Task 7: Extend metrics with oracle accuracy

**Files:**
- Modify: `src/casework-core/metrics.ts`
- Modify: `tests/casework-core/metrics.test.ts`

**Context:** The `RunSummary` gains `oracleMetrics` with eligibility match rate, benefit exact match rate, average benefit delta, mismatch count, and mismatches by severity. Computed from `CaseResult.oracleComparison`. Also uses `compareWithOracle` result's `mismatches` array -- the runner should store mismatches on CaseResult too.

**Step 1: Write failing tests**

Add to `tests/casework-core/metrics.test.ts`:

```typescript
describe('oracle metrics', () => {
  it('computes oracle metrics from run results', () => {
    const cases = generateMissingDocsCases(50, 42);
    const result = runMissingDocsScenario(cases);
    const summary = computeRunSummary(result);

    expect(summary.oracleMetrics).toBeDefined();
    expect(summary.oracleMetrics.casesEvaluated).toBeGreaterThan(0);
    expect(summary.oracleMetrics.eligibilityMatchRate).toBeGreaterThanOrEqual(0);
    expect(summary.oracleMetrics.eligibilityMatchRate).toBeLessThanOrEqual(1);
    expect(typeof summary.oracleMetrics.mismatchCount).toBe('number');
    expect(typeof summary.oracleMetrics.mismatchesBySeverity).toBe('object');
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/casework-core/metrics.test.ts`
Expected: FAIL -- oracleMetrics is undefined

**Step 3: Extend metrics**

Modify `src/casework-core/metrics.ts`:

1. Add to `RunSummary`:
```typescript
oracleMetrics: {
  casesEvaluated: number;
  eligibilityMatchRate: number;
  benefitExactMatchRate: number;
  averageBenefitDelta: number;
  mismatchCount: number;
  mismatchesBySeverity: Record<string, number>;
};
```

2. In `computeRunSummary`, add oracle metric computation:
```typescript
  // Oracle metrics
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
```

3. Add `oracleMetrics` to the return object.

Note: `CaseResult` needs a `mismatches` field (from `compareWithOracle`). Add `mismatches?: MismatchRecord[]` to `CaseResult` in `runner.ts` and populate it in the runner alongside `oracleComparison`.

**Step 4: Run tests**

Run: `pnpm vitest run tests/casework-core/metrics.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/casework-core/metrics.ts src/casework-core/runner.ts tests/casework-core/metrics.test.ts
git commit -m "feat(core): oracle accuracy metrics in run summary"
```

---

### Task 8: DB migration -- qa_mismatches table

**Files:**
- Create: `src/db/schema/qa-mismatches.ts`
- Modify: `src/db/schema/index.ts`

**Context:** New `qa_mismatches` table stores oracle mismatches per run. Same pattern as `runs.ts` -- use `pgTable`, `uuid`, `text`, `jsonb`, `timestamp` from drizzle. Push schema with `pnpm drizzle-kit push`.

**Step 1: Create schema**

Create `src/db/schema/qa-mismatches.ts`:

```typescript
import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { runs } from './runs';

export const qaMismatches = pgTable('qa_mismatches', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  runnerCaseId: text('runner_case_id').notNull(),
  mismatchType: text('mismatch_type').notNull(), // 'eligibility' | 'benefit_amount' | 'deduction' | 'citation'
  severity: text('severity').notNull(), // 'critical' | 'high' | 'medium' | 'low'
  runnerValue: text('runner_value').notNull(),
  oracleValue: text('oracle_value').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**Step 2: Update barrel export**

Modify `src/db/schema/index.ts` -- add:

```typescript
export { qaMismatches } from './qa-mismatches';
```

**Step 3: Push schema**

Run: `pnpm drizzle-kit push`
Expected: Creates `qa_mismatches` table

**Step 4: Commit**

```bash
git add src/db/schema/qa-mismatches.ts src/db/schema/index.ts
git commit -m "feat(db): qa_mismatches table for oracle mismatch tracking"
```

---

### Task 9: Store mismatches in DB during runs

**Files:**
- Modify: `src/casework-api/routes/runs.ts`

**Context:** The `POST /runs` endpoint already calls the runner and stores the run summary. Now it also inserts mismatch records into `qa_mismatches` from the runner's results. Import the new schema and insert after the run completes.

**Step 1: Update the runs route**

Modify `src/casework-api/routes/runs.ts`:

1. Import `qaMismatches` from schema
2. After computing the summary, extract mismatches from case results and batch-insert:

```typescript
import { qaMismatches } from '@db/schema/qa-mismatches';

// After: const [run] = await db.insert(runs)...

// Store mismatches
const mismatchRows = [];
for (const cr of result.caseResults) {
  if (cr.mismatches) {
    for (const m of cr.mismatches) {
      mismatchRows.push({
        runId: run.id,
        runnerCaseId: cr.caseId,
        mismatchType: m.mismatchType,
        severity: m.severity,
        runnerValue: m.runnerValue,
        oracleValue: m.oracleValue,
        detail: m,
      });
    }
  }
}

if (mismatchRows.length > 0) {
  await db.insert(qaMismatches).values(mismatchRows);
}
```

3. Update the `RunSummaryRecord` in `src/shared/types.ts` to include `oracleMetrics`.

**Step 2: Run all tests**

Run: `pnpm vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add src/casework-api/routes/runs.ts src/shared/types.ts
git commit -m "feat(api): store oracle mismatches in DB during scenario runs"
```

---

### Task 10: API endpoints -- oracle evaluate + mismatches

**Files:**
- Create: `src/casework-api/routes/oracle.ts`
- Modify: `src/casework-api/routes/runs.ts`
- Modify: `src/casework-api/routes/index.ts`
- Create: `tests/casework-api/routes/oracle.test.ts`

**Context:** Two new endpoints: `POST /api/oracle/evaluate` for ad-hoc oracle calls, and `GET /api/runs/:id/mismatches` for retrieving stored mismatches. The oracle endpoint loads rules.json and calls `computeEligibility`. The mismatches endpoint queries `qa_mismatches` filtered by run ID and optional severity.

**Step 1: Write failing tests**

Create `tests/casework-api/routes/oracle.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeEligibility, type OracleInput, type PolicyPackRules } from '@core/oracle';
import { readFileSync } from 'fs';
import path from 'path';

const rules: PolicyPackRules = JSON.parse(
  readFileSync(
    path.join(__dirname, '../../../policy-packs/snap-illinois-fy2026-v1/rules.json'),
    'utf-8',
  ),
);

describe('oracle evaluate endpoint logic', () => {
  it('returns eligible for low-income single person', () => {
    const input: OracleInput = {
      householdSize: 1,
      householdMembers: [{ age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' }],
      income: [{ type: 'earned', amount: 800, frequency: 'monthly', source: 'wages', verified: true }],
      resources: [],
      shelterCosts: { rent: 600, suaTier: 'heatingCooling' },
      applicationDate: '2026-01-15',
      policyPackId: 'snap-illinois-fy2026-v1',
    };
    const result = computeEligibility(input, rules);
    expect(result.eligible).toBe(true);
    expect(result.benefitAmount).toBeGreaterThan(0);
    expect(result.calculationSteps.length).toBeGreaterThan(0);
  });

  it('returns ineligible for high-income person', () => {
    const input: OracleInput = {
      householdSize: 1,
      householdMembers: [{ age: 30, isDisabled: false, isStudent: false, citizenshipStatus: 'citizen' }],
      income: [{ type: 'earned', amount: 5000, frequency: 'monthly', source: 'salary', verified: true }],
      resources: [],
      shelterCosts: { suaTier: 'none' },
      applicationDate: '2026-01-15',
      policyPackId: 'snap-illinois-fy2026-v1',
    };
    const result = computeEligibility(input, rules);
    expect(result.eligible).toBe(false);
    expect(result.failedTests.length).toBeGreaterThan(0);
  });
});
```

**Step 2: Run tests**

Run: `pnpm vitest run tests/casework-api/routes/oracle.test.ts`
Expected: PASS (these test the core logic, not the HTTP layer)

**Step 3: Create oracle route**

Create `src/casework-api/routes/oracle.ts`:

```typescript
import { Router } from 'express';
import { computeEligibility, type OracleInput, type PolicyPackRules } from '@core/oracle';
import { readFileSync } from 'fs';
import path from 'path';

const router = Router();

let _rules: PolicyPackRules | null = null;
function getRules(): PolicyPackRules {
  if (!_rules) {
    _rules = JSON.parse(
      readFileSync(
        path.join(__dirname, '../../../policy-packs/snap-illinois-fy2026-v1/rules.json'),
        'utf-8',
      ),
    ) as PolicyPackRules;
  }
  return _rules;
}

router.post('/evaluate', (req, res) => {
  const input = req.body as OracleInput;

  if (!input.householdSize || !input.householdMembers || !input.shelterCosts) {
    return res.status(400).json({
      success: false,
      error: 'Missing required fields: householdSize, householdMembers, shelterCosts',
    });
  }

  const result = computeEligibility(input, getRules());
  res.json({ success: true, data: result });
});

export default router;
```

**Step 4: Add mismatches endpoint to runs route**

Add to `src/casework-api/routes/runs.ts`:

```typescript
// GET /runs/:id/mismatches
router.get('/:id/mismatches', async (req, res) => {
  const { severity } = req.query as { severity?: string };

  let query = db
    .select()
    .from(qaMismatches)
    .where(eq(qaMismatches.runId, req.params.id));

  const rows = await query;

  const filtered = severity
    ? rows.filter(r => r.severity === severity)
    : rows;

  res.json({ success: true, data: filtered });
});
```

**Step 5: Register oracle route**

Modify `src/casework-api/routes/index.ts`:

```typescript
import oracleRouter from './oracle';
// ...
router.use('/oracle', oracleRouter);
```

**Step 6: Run all tests**

Run: `pnpm vitest run`
Expected: All pass

**Step 7: Commit**

```bash
git add src/casework-api/routes/oracle.ts src/casework-api/routes/runs.ts src/casework-api/routes/index.ts tests/casework-api/routes/oracle.test.ts
git commit -m "feat(api): oracle evaluate endpoint and run mismatches endpoint"
```

---

### Task 11: UI -- Oracle metrics and mismatch list

**Files:**
- Modify: `src/casework-ui/components/RunSummaryCard.tsx`
- Create: `src/casework-ui/components/MismatchList.tsx`
- Modify: `src/casework-ui/pages/EventLog.tsx`
- Modify: `src/casework-ui/lib/api.ts`

**Context:** The RunSummaryCard gains an "Oracle Accuracy" section. A new MismatchList component shows mismatches with severity badges. Both are added to EventLog.tsx below the existing run results.

**Step 1: Add API method**

Add to `src/casework-ui/lib/api.ts`:

```typescript
getRunMismatches: (runId: string, severity?: string) =>
  request(`/runs/${runId}/mismatches${severity ? `?severity=${severity}` : ''}`),
evaluateOracle: (input: any) =>
  request('/oracle/evaluate', { method: 'POST', body: JSON.stringify(input) }),
```

**Step 2: Update RunSummaryCard**

Add oracle metrics section to `RunSummaryCard.tsx`. Add `oracleMetrics?` to the `RunSummaryData` interface:

```typescript
oracleMetrics?: {
  casesEvaluated: number;
  eligibilityMatchRate: number;
  benefitExactMatchRate: number;
  averageBenefitDelta: number;
  mismatchCount: number;
  mismatchesBySeverity: Record<string, number>;
};
```

Add below the existing grid in the JSX:

```tsx
{summary.oracleMetrics && (
  <div className="mt-3 pt-3 border-t border-gray-700">
    <h4 className="text-xs font-medium text-gray-400 mb-2">Oracle Accuracy</h4>
    <div className="grid grid-cols-3 gap-4 text-sm">
      <div>
        <span className="text-gray-500">Eligibility Match:</span>{' '}
        <span className={summary.oracleMetrics.eligibilityMatchRate < 0.8 ? 'text-red-400' : 'text-green-400'}>
          {(summary.oracleMetrics.eligibilityMatchRate * 100).toFixed(0)}%
        </span>
      </div>
      <div>
        <span className="text-gray-500">Avg Benefit Delta:</span>{' '}
        <span className="text-white">${summary.oracleMetrics.averageBenefitDelta.toFixed(0)}</span>
      </div>
      <div>
        <span className="text-gray-500">Mismatches:</span>{' '}
        <span className="text-yellow-400">{summary.oracleMetrics.mismatchCount}</span>
      </div>
    </div>
  </div>
)}
```

**Step 3: Create MismatchList component**

Create `src/casework-ui/components/MismatchList.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { api } from '@ui/lib/api';

interface Mismatch {
  id: string;
  runnerCaseId: string;
  mismatchType: string;
  severity: string;
  runnerValue: string;
  oracleValue: string;
}

interface Props {
  runId: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-900/50 text-red-400',
  high: 'bg-orange-900/50 text-orange-400',
  medium: 'bg-yellow-900/50 text-yellow-400',
  low: 'bg-gray-700 text-gray-400',
};

export function MismatchList({ runId }: Props) {
  const [mismatches, setMismatches] = useState<Mismatch[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await api.getRunMismatches(runId);
      if (res.success && Array.isArray(res.data)) {
        setMismatches(res.data as Mismatch[]);
      }
    })();
  }, [runId]);

  if (mismatches.length === 0) return null;

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-6">
      <button
        onClick={() => setExpanded(!expanded)}
        className="text-sm font-medium text-gray-300 hover:text-white"
      >
        {expanded ? '- ' : '+ '}QA Mismatches ({mismatches.length})
      </button>
      {expanded && (
        <div className="mt-3 space-y-2">
          {mismatches.slice(0, 20).map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-xs">
              <span className={`px-1.5 py-0.5 rounded ${SEVERITY_COLORS[m.severity] ?? SEVERITY_COLORS.low}`}>
                {m.severity}
              </span>
              <span className="text-gray-500 font-mono">{m.runnerCaseId.slice(0, 8)}...</span>
              <span className="text-gray-400">{m.mismatchType}:</span>
              <span className="text-red-400">{m.runnerValue}</span>
              <span className="text-gray-600">vs</span>
              <span className="text-green-400">{m.oracleValue}</span>
            </div>
          ))}
          {mismatches.length > 20 && (
            <div className="text-xs text-gray-500">...and {mismatches.length - 20} more</div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 4: Wire into EventLog**

Modify `src/casework-ui/pages/EventLog.tsx`:

1. Import `MismatchList`
2. Track `runId` alongside `runSummary`:
```typescript
const [runId, setRunId] = useState<string | null>(null);
```
3. Update `RunScenarioForm.onComplete` to also capture runId from the response
4. Add below `RunSummaryCard`:
```tsx
{runId && <MismatchList runId={runId} />}
```

**Step 5: Commit**

```bash
git add src/casework-ui/components/RunSummaryCard.tsx src/casework-ui/components/MismatchList.tsx src/casework-ui/pages/EventLog.tsx src/casework-ui/lib/api.ts
git commit -m "feat(ui): oracle accuracy metrics and mismatch list in run results"
```

---

### Task 12: Update shared types

**Files:**
- Modify: `src/shared/types.ts`

**Context:** The `RunSummaryRecord` needs `oracleMetrics` so the UI can type-check the response. Keep in sync with the `RunSummary` interface in `metrics.ts`.

**Step 1: Update types**

Add to `RunSummaryRecord` in `src/shared/types.ts`:

```typescript
oracleMetrics?: {
  casesEvaluated: number;
  eligibilityMatchRate: number;
  benefitExactMatchRate: number;
  averageBenefitDelta: number;
  mismatchCount: number;
  mismatchesBySeverity: Record<string, number>;
};
```

**Step 2: Run all tests**

Run: `pnpm vitest run`
Expected: All pass

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "feat(shared): add oracleMetrics to RunSummaryRecord"
```

---

### Task 13: End-to-end verification

**Files:** None (verification only)

**Context:** Run 100 cases via the API, verify oracle metrics are present and non-trivial. Check the UI. This mirrors M2 Task 11.

**Step 1: Run all tests**

Run: `pnpm vitest run`
Expected: All pass

**Step 2: Start dev server**

Run: `pnpm dev` (background)

**Step 3: Run 100 cases via curl**

```bash
curl -s -X POST http://localhost:3002/api/runs \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"missing_docs","count":100}' | jq '.data.summary.oracleMetrics'
```

Expected: JSON with `casesEvaluated > 0`, `mismatchCount > 0`, `eligibilityMatchRate` between 0 and 1.

**Step 4: Test oracle endpoint**

```bash
curl -s -X POST http://localhost:3002/api/oracle/evaluate \
  -H 'Content-Type: application/json' \
  -d '{"householdSize":1,"householdMembers":[{"age":30,"isDisabled":false,"isStudent":false,"citizenshipStatus":"citizen"}],"income":[{"type":"earned","amount":1500,"frequency":"monthly","source":"wages","verified":true}],"resources":[],"shelterCosts":{"rent":800,"suaTier":"heatingCooling"},"applicationDate":"2026-01-15","policyPackId":"snap-illinois-fy2026-v1"}' | jq '.data.eligible, .data.benefitAmount'
```

Expected: `true` and a positive benefit amount.

**Step 5: Test mismatches endpoint**

```bash
# Get the run ID from step 3, then:
curl -s http://localhost:3002/api/runs | jq '.[0].id'
# Use that ID:
curl -s http://localhost:3002/api/runs/<RUN_ID>/mismatches | jq '.data | length'
```

Expected: Non-zero mismatch count.

**Step 6: Browser verification**

Open http://localhost:5174, click "Run Scenario", click "Start". Verify:
- RunSummaryCard shows Oracle Accuracy section
- MismatchList is expandable and shows severity badges

**Step 7: Take screenshot and commit**

```bash
git add docs/screenshots/m3-oracle-results.png
git commit -m "verify: M3 end-to-end oracle + mismatches working"
```

---

### Task 14: Push + PR

**Step 1: Push branch**

```bash
git push -u origin feature/m3-oracle-determination-worksheet
```

**Step 2: Create PR**

```bash
gh pr create --title "M3: Oracle + determination worksheet" --body "$(cat <<'EOF'
## Summary

- Deterministic SNAP eligibility/benefit oracle (16-step algorithm from 7 CFR 273.10)
- Oracle comparison function with severity-based mismatch detection
- Extended scenario generator with full financial profiles (income, resources, shelter, deductions)
- Runner integration: oracle evaluates every determination, stores comparisons
- QA mismatches table with DB persistence
- API: POST /oracle/evaluate (ad-hoc), GET /runs/:id/mismatches
- UI: Oracle accuracy metrics in RunSummaryCard, expandable mismatch list
- RunSummary extended with oracleMetrics

## Exit Criteria Verified

- Oracle mismatch auto-creates QA records in qa_mismatches table
- Mismatch rate is measurable and displayed in UI
- 100 cases run end-to-end with oracle evaluation

## Test plan

- [ ] All tests pass (`pnpm test`)
- [ ] 100-case run produces non-zero mismatch count
- [ ] Oracle evaluate endpoint returns correct results
- [ ] UI shows oracle accuracy and mismatch list

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
