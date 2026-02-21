// src/casework-core/oracle.ts
// Deterministic SNAP eligibility and benefit oracle.
// Pure function: (input, rules) -> output. No side effects.

// ── Household ────────────────────────────────────────────────────────────────

export interface HouseholdMember {
  age: number;
  isDisabled: boolean;
  isStudent: boolean;
  citizenshipStatus: 'citizen' | 'qualified_alien' | 'ineligible';
}

// ── Income ───────────────────────────────────────────────────────────────────

export type IncomeFrequency = 'weekly' | 'biweekly' | 'monthly' | 'annual';
export type IncomeType = 'earned' | 'unearned' | 'excluded';

export interface IncomeItem {
  type: IncomeType;
  amount: number;
  frequency: IncomeFrequency;
  source: string;
  verified: boolean;
}

// ── Resources ────────────────────────────────────────────────────────────────

export interface ResourceItem {
  type: string;
  value: number;
  countable: boolean;
}

// ── Shelter ──────────────────────────────────────────────────────────────────

export type SuaTier =
  | 'heatingCooling'
  | 'limitedUtility'
  | 'singleUtility'
  | 'telephoneOnly'
  | 'none';

export interface ShelterCosts {
  rent?: number;
  mortgage?: number;
  propertyTax?: number;
  insurance?: number;
  condoFees?: number;
  suaTier: SuaTier;
}

// ── Oracle I/O ───────────────────────────────────────────────────────────────

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
    suaTier: SuaTier;
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

// ── PolicyPackRules (typed to match rules.json) ──────────────────────────────

export interface PolicyPackRules {
  incomeTests: {
    grossIncomeTest: {
      ruleId: string;
      description: string;
      appliesTo: string;
      thresholdPctFpl: number;
      thresholdPctFplWithQM: number;
      exemptIfCategoricallyEligible: boolean;
      citation: string;
    };
    netIncomeTest: {
      ruleId: string;
      description: string;
      appliesTo: string;
      thresholdPctFpl: number;
      citation: string;
    };
  };
  resourceLimits: {
    standard: {
      ruleId: string;
      limit: number;
      appliesTo: string;
      citation: string;
    };
    withQualifyingMember: {
      ruleId: string;
      limit: number;
      appliesTo: string;
      citation: string;
    };
  };
  fplTable: {
    ruleId: string;
    fiscalYear: string;
    citation: string;
    monthlyByHouseholdSize: Record<string, number>;
    additionalMember: number;
  };
  maxAllotments: {
    ruleId: string;
    fiscalYear: string;
    citation: string;
    monthlyByHouseholdSize: Record<string, number>;
    additionalMember: number;
    minimumBenefit: number;
    minimumBenefitAppliesTo: number[];
  };
  deductions: {
    standard: {
      ruleId: string;
      citation: string;
      byHouseholdSize: Record<string, number>;
      sixPlusAppliesTo: string;
    };
    earnedIncome: {
      ruleId: string;
      rate: number;
      citation: string;
    };
    medical: {
      ruleId: string;
      threshold: number;
      appliesTo: string;
      standardGroupHome: number;
      standardCommunity: number;
      citation: string;
    };
    dependentCare: {
      ruleId: string;
      citation: string;
    };
    childSupport: {
      ruleId: string;
      type: string;
      citation: string;
    };
    excessShelter: {
      ruleId: string;
      incomeMultiplier: number;
      cap: number;
      capWaivedFor: string;
      citation: string;
    };
    homelessShelter: {
      ruleId: string;
      standardAmount: number;
      citation: string;
    };
  };
  utilityAllowances: {
    ruleId: string;
    citation: string;
    tiers: Record<string, number>;
  };
  benefitFormula: {
    ruleId: string;
    contributionRate: number;
    formula: string;
    roundDirection: string;
    minimumIssuance: number;
    citation: string;
  };
  incomeConversion: {
    ruleId: string;
    weeklyMultiplier: number;
    biweeklyMultiplier: number;
    citation: string;
  };
  verification: {
    mandatory: {
      ruleId: string;
      items: string[];
      citation: string;
    };
    conditional: {
      ruleId: string;
      items: string[];
      citation: string;
    };
    responseDeadlineMinDays: number;
    failureVsRefusalDistinction: boolean;
  };
  noticeRequirements: {
    approval: { ruleId: string; requiredFields: string[]; citation: string };
    denial: { ruleId: string; requiredFields: string[]; citation: string };
    adverseAction: {
      ruleId: string;
      requiredFields: string[];
      advanceNoticeDays: number;
      citation: string;
    };
    verificationRequest: {
      ruleId: string;
      requiredFields: string[];
      citation: string;
    };
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toMonthly(
  amount: number,
  frequency: IncomeFrequency,
  conversionRules: PolicyPackRules['incomeConversion'],
): number {
  switch (frequency) {
    case 'weekly':
      return amount * conversionRules.weeklyMultiplier;
    case 'biweekly':
      return amount * conversionRules.biweeklyMultiplier;
    case 'annual':
      return amount / 12;
    case 'monthly':
      return amount;
  }
}

function getFplThreshold(
  householdSize: number,
  pctFpl: number,
  fplTable: PolicyPackRules['fplTable'],
): number {
  const maxTabled = 8;
  let baseFpl: number;

  if (householdSize <= maxTabled) {
    baseFpl = fplTable.monthlyByHouseholdSize[String(householdSize)] ?? 0;
  } else {
    const base8 = fplTable.monthlyByHouseholdSize['8'] ?? 0;
    baseFpl = base8 + (householdSize - maxTabled) * fplTable.additionalMember;
  }

  return Math.floor((baseFpl * pctFpl) / 100);
}

function getMaxAllotment(
  householdSize: number,
  allotments: PolicyPackRules['maxAllotments'],
): number {
  const maxTabled = 10;

  if (householdSize <= maxTabled) {
    return allotments.monthlyByHouseholdSize[String(householdSize)] ?? 0;
  }

  const base10 = allotments.monthlyByHouseholdSize['10'] ?? 0;
  return base10 + (householdSize - maxTabled) * allotments.additionalMember;
}

function getStandardDeduction(
  householdSize: number,
  stdTable: PolicyPackRules['deductions']['standard'],
): number {
  if (householdSize <= 3) return stdTable.byHouseholdSize['1'] ?? 0;
  if (householdSize === 4) return stdTable.byHouseholdSize['4'] ?? 0;
  if (householdSize === 5) return stdTable.byHouseholdSize['5'] ?? 0;
  return stdTable.byHouseholdSize['6'] ?? 0;
}

// ── Main computation ─────────────────────────────────────────────────────────

export function computeEligibility(
  input: OracleInput,
  rules: PolicyPackRules,
): OracleOutput {
  const steps: CalculationStep[] = [];
  const citedRules: string[] = [];
  const failedTests: FailedTest[] = [];

  const addRule = (ruleId: string) => {
    if (!citedRules.includes(ruleId)) citedRules.push(ruleId);
  };

  // ── Step 1: Classify household ────────────────────────────────────────────
  const hasElderlyOrDisabled = input.householdMembers.some(
    (m) => m.age >= 60 || m.isDisabled,
  );

  steps.push({
    stepNumber: 1,
    description: 'Classify household (elderly/disabled)',
    ruleId: rules.incomeTests.grossIncomeTest.ruleId,
    inputs: {
      memberCount: input.householdMembers.length,
      hasElderlyOrDisabled: String(hasElderlyOrDisabled),
    },
    output: hasElderlyOrDisabled,
    formula: 'any member age >= 60 OR isDisabled',
  });
  addRule(rules.incomeTests.grossIncomeTest.ruleId);

  // ── Step 2: Convert all income to monthly ─────────────────────────────────
  let grossEarned = 0;
  let grossUnearned = 0;

  for (const item of input.income) {
    if (item.type === 'excluded') continue;

    const monthly = toMonthly(item.amount, item.frequency, rules.incomeConversion);

    if (item.type === 'earned') {
      grossEarned += monthly;
    } else {
      grossUnearned += monthly;
    }
  }

  addRule(rules.incomeConversion.ruleId);

  steps.push({
    stepNumber: 2,
    description: 'Convert all income to monthly amounts',
    ruleId: rules.incomeConversion.ruleId,
    inputs: {
      earnedItems: input.income.filter((i) => i.type === 'earned').length,
      unearnedItems: input.income.filter((i) => i.type === 'unearned').length,
      excludedItems: input.income.filter((i) => i.type === 'excluded').length,
    },
    output: grossEarned + grossUnearned,
    formula: 'weekly * 4.3, biweekly * 2.15, annual / 12',
  });

  // ── Step 3: Gross income ──────────────────────────────────────────────────
  const grossIncome = grossEarned + grossUnearned;

  steps.push({
    stepNumber: 3,
    description: 'Calculate gross monthly income',
    ruleId: rules.incomeTests.grossIncomeTest.ruleId,
    inputs: { grossEarned, grossUnearned },
    output: grossIncome,
    formula: 'grossEarned + grossUnearned',
  });

  // ── Step 4: Resource test ─────────────────────────────────────────────────
  const totalResources = input.resources
    .filter((r) => r.countable)
    .reduce((sum, r) => sum + r.value, 0);

  const resourceLimit = hasElderlyOrDisabled
    ? rules.resourceLimits.withQualifyingMember.limit
    : rules.resourceLimits.standard.limit;

  const resourceRuleId = hasElderlyOrDisabled
    ? rules.resourceLimits.withQualifyingMember.ruleId
    : rules.resourceLimits.standard.ruleId;

  addRule(resourceRuleId);

  const resourceTestPassed = totalResources <= resourceLimit;

  steps.push({
    stepNumber: 4,
    description: 'Resource test',
    ruleId: resourceRuleId,
    inputs: { totalResources, resourceLimit },
    output: resourceTestPassed,
    formula: 'totalCountableResources <= limit',
  });

  if (!resourceTestPassed) {
    failedTests.push({
      testName: 'Resource Test',
      ruleId: resourceRuleId,
      reason: `Countable resources ($${totalResources}) exceed limit ($${resourceLimit})`,
      actual: totalResources,
      limit: resourceLimit,
    });

    return buildIneligibleOutput(
      grossIncome,
      failedTests,
      citedRules,
      steps,
      `Resources ($${totalResources}) exceed limit ($${resourceLimit})`,
    );
  }

  // ── Step 5: Gross income test ─────────────────────────────────────────────
  const grossPctFpl = hasElderlyOrDisabled
    ? rules.incomeTests.grossIncomeTest.thresholdPctFplWithQM
    : rules.incomeTests.grossIncomeTest.thresholdPctFpl;

  const grossIncomeLimit = getFplThreshold(
    input.householdSize,
    grossPctFpl,
    rules.fplTable,
  );

  addRule(rules.incomeTests.grossIncomeTest.ruleId);
  addRule(rules.fplTable.ruleId);

  const grossTestPassed = grossIncome <= grossIncomeLimit;

  steps.push({
    stepNumber: 5,
    description: `Gross income test (${grossPctFpl}% FPL)`,
    ruleId: rules.incomeTests.grossIncomeTest.ruleId,
    inputs: { grossIncome, grossIncomeLimit, pctFpl: grossPctFpl },
    output: grossTestPassed,
    formula: `grossIncome <= FPL * ${grossPctFpl}%`,
  });

  if (!grossTestPassed) {
    failedTests.push({
      testName: 'Gross Income Test',
      ruleId: rules.incomeTests.grossIncomeTest.ruleId,
      reason: `Gross income ($${grossIncome}) exceeds ${grossPctFpl}% FPL limit ($${grossIncomeLimit})`,
      actual: grossIncome,
      limit: grossIncomeLimit,
    });

    return buildIneligibleOutput(
      grossIncome,
      failedTests,
      citedRules,
      steps,
      `Gross income ($${grossIncome}) exceeds ${grossPctFpl}% FPL ($${grossIncomeLimit})`,
    );
  }

  // ── Step 6: Standard deduction ────────────────────────────────────────────
  const standardDeduction = getStandardDeduction(
    input.householdSize,
    rules.deductions.standard,
  );

  addRule(rules.deductions.standard.ruleId);

  steps.push({
    stepNumber: 6,
    description: 'Apply standard deduction',
    ruleId: rules.deductions.standard.ruleId,
    inputs: { householdSize: input.householdSize },
    output: standardDeduction,
    formula: 'lookup by household size bracket',
  });

  // ── Step 7: Earned income deduction ───────────────────────────────────────
  const earnedIncomeDeduction = Math.floor(
    grossEarned * rules.deductions.earnedIncome.rate,
  );

  addRule(rules.deductions.earnedIncome.ruleId);

  steps.push({
    stepNumber: 7,
    description: 'Earned income deduction (20%)',
    ruleId: rules.deductions.earnedIncome.ruleId,
    inputs: { grossEarned, rate: rules.deductions.earnedIncome.rate },
    output: earnedIncomeDeduction,
    formula: 'floor(grossEarned * 0.20)',
  });

  // ── Step 8: Dependent care deduction ──────────────────────────────────────
  const dependentCareDeduction = input.dependentCareCosts ?? 0;

  addRule(rules.deductions.dependentCare.ruleId);

  steps.push({
    stepNumber: 8,
    description: 'Dependent care deduction',
    ruleId: rules.deductions.dependentCare.ruleId,
    inputs: { dependentCareCosts: dependentCareDeduction },
    output: dependentCareDeduction,
  });

  // ── Step 9: Child support deduction ───────────────────────────────────────
  const childSupportDeduction = input.childSupportPaid ?? 0;

  addRule(rules.deductions.childSupport.ruleId);

  steps.push({
    stepNumber: 9,
    description: 'Child support deduction',
    ruleId: rules.deductions.childSupport.ruleId,
    inputs: { childSupportPaid: childSupportDeduction },
    output: childSupportDeduction,
  });

  // ── Step 10: Medical deduction ────────────────────────────────────────────
  let medicalDeduction = 0;

  if (hasElderlyOrDisabled && (input.medicalExpenses ?? 0) > 0) {
    medicalDeduction = Math.max(
      0,
      (input.medicalExpenses ?? 0) - rules.deductions.medical.threshold,
    );
  }

  addRule(rules.deductions.medical.ruleId);

  steps.push({
    stepNumber: 10,
    description: 'Medical deduction (elderly/disabled only)',
    ruleId: rules.deductions.medical.ruleId,
    inputs: {
      medicalExpenses: input.medicalExpenses ?? 0,
      threshold: rules.deductions.medical.threshold,
      hasElderlyOrDisabled: String(hasElderlyOrDisabled),
    },
    output: medicalDeduction,
    formula: 'max(0, medicalExpenses - 35)',
  });

  // ── Adjusted income (pre-shelter) ─────────────────────────────────────────
  const adjustedIncomePreShelter =
    grossIncome -
    standardDeduction -
    earnedIncomeDeduction -
    dependentCareDeduction -
    childSupportDeduction -
    medicalDeduction;

  // ── Step 11: Excess shelter deduction ─────────────────────────────────────
  const rent = input.shelterCosts.rent ?? 0;
  const mortgage = input.shelterCosts.mortgage ?? 0;
  const propertyTax = input.shelterCosts.propertyTax ?? 0;
  const insurance = input.shelterCosts.insurance ?? 0;
  const condoFees = input.shelterCosts.condoFees ?? 0;

  const suaTier = input.shelterCosts.suaTier;
  const suaAmount =
    suaTier !== 'none'
      ? (rules.utilityAllowances.tiers[suaTier] ?? 0)
      : 0;

  addRule(rules.utilityAllowances.ruleId);

  const totalShelterCosts =
    rent + mortgage + propertyTax + insurance + condoFees + suaAmount;

  const halfAdjustedIncome =
    adjustedIncomePreShelter * rules.deductions.excessShelter.incomeMultiplier;

  let excessShelter = Math.max(0, totalShelterCosts - halfAdjustedIncome);

  if (!hasElderlyOrDisabled) {
    excessShelter = Math.min(excessShelter, rules.deductions.excessShelter.cap);
  }

  addRule(rules.deductions.excessShelter.ruleId);

  steps.push({
    stepNumber: 11,
    description: 'Excess shelter deduction',
    ruleId: rules.deductions.excessShelter.ruleId,
    inputs: {
      totalShelterCosts,
      halfAdjustedIncome,
      cap: rules.deductions.excessShelter.cap,
      hasElderlyOrDisabled: String(hasElderlyOrDisabled),
    },
    output: excessShelter,
    formula:
      'max(0, totalShelter - 50% * adjustedIncome); capped at 744 if not elderly/disabled',
  });

  // ── Step 12: Net income ───────────────────────────────────────────────────
  const totalDeductions =
    standardDeduction +
    earnedIncomeDeduction +
    dependentCareDeduction +
    childSupportDeduction +
    medicalDeduction +
    excessShelter;

  const netIncome = Math.max(0, grossIncome - totalDeductions);

  addRule(rules.incomeTests.netIncomeTest.ruleId);

  steps.push({
    stepNumber: 12,
    description: 'Calculate net income',
    ruleId: rules.incomeTests.netIncomeTest.ruleId,
    inputs: { grossIncome, totalDeductions },
    output: netIncome,
    formula: 'max(0, grossIncome - totalDeductions)',
  });

  // ── Step 13: Net income test ──────────────────────────────────────────────
  const netIncomeLimit = getFplThreshold(
    input.householdSize,
    rules.incomeTests.netIncomeTest.thresholdPctFpl,
    rules.fplTable,
  );

  const netTestPassed = netIncome <= netIncomeLimit;

  steps.push({
    stepNumber: 13,
    description: 'Net income test (100% FPL)',
    ruleId: rules.incomeTests.netIncomeTest.ruleId,
    inputs: { netIncome, netIncomeLimit },
    output: netTestPassed,
    formula: 'netIncome <= FPL * 100%',
  });

  if (!netTestPassed) {
    failedTests.push({
      testName: 'Net Income Test',
      ruleId: rules.incomeTests.netIncomeTest.ruleId,
      reason: `Net income ($${netIncome}) exceeds 100% FPL limit ($${netIncomeLimit})`,
      actual: netIncome,
      limit: netIncomeLimit,
    });

    return buildIneligibleOutput(
      grossIncome,
      failedTests,
      citedRules,
      steps,
      `Net income ($${netIncome}) exceeds 100% FPL ($${netIncomeLimit})`,
      buildDeductions(
        standardDeduction,
        earnedIncomeDeduction,
        dependentCareDeduction,
        childSupportDeduction,
        medicalDeduction,
        excessShelter,
        totalDeductions,
        { rent, mortgage, propertyTax, insurance, condoFees, suaTier, suaAmount, totalShelterCosts },
      ),
      netIncome,
    );
  }

  // ── Step 14: Benefit calculation ──────────────────────────────────────────
  const maxAllotment = getMaxAllotment(input.householdSize, rules.maxAllotments);

  addRule(rules.maxAllotments.ruleId);
  addRule(rules.benefitFormula.ruleId);

  let benefitAmount = Math.floor(
    maxAllotment - rules.benefitFormula.contributionRate * netIncome,
  );

  steps.push({
    stepNumber: 14,
    description: 'Calculate benefit amount',
    ruleId: rules.benefitFormula.ruleId,
    inputs: {
      maxAllotment,
      contributionRate: rules.benefitFormula.contributionRate,
      netIncome,
    },
    output: benefitAmount,
    formula: 'floor(maxAllotment - 0.30 * netIncome)',
  });

  // ── Step 15: Minimum benefit ──────────────────────────────────────────────
  const minBenefitApplies = rules.maxAllotments.minimumBenefitAppliesTo.includes(
    input.householdSize,
  );

  if (
    minBenefitApplies &&
    benefitAmount > 0 &&
    benefitAmount < rules.maxAllotments.minimumBenefit
  ) {
    benefitAmount = rules.maxAllotments.minimumBenefit;
  }

  steps.push({
    stepNumber: 15,
    description: 'Apply minimum benefit rule',
    ruleId: rules.maxAllotments.ruleId,
    inputs: {
      benefitAmount,
      minimumBenefit: rules.maxAllotments.minimumBenefit,
      householdSize: input.householdSize,
      minBenefitApplies: String(minBenefitApplies),
    },
    output: benefitAmount,
    formula: 'if HH size 1-2 and 0 < benefit < 24, set to 24',
  });

  // ── Step 16: Final eligibility ────────────────────────────────────────────
  const eligible = benefitAmount > 0;

  steps.push({
    stepNumber: 16,
    description: 'Final eligibility determination',
    ruleId: rules.benefitFormula.ruleId,
    inputs: { benefitAmount },
    output: eligible,
    formula: 'benefit > 0',
  });

  const deductions = buildDeductions(
    standardDeduction,
    earnedIncomeDeduction,
    dependentCareDeduction,
    childSupportDeduction,
    medicalDeduction,
    excessShelter,
    totalDeductions,
    { rent, mortgage, propertyTax, insurance, condoFees, suaTier, suaAmount, totalShelterCosts },
  );

  if (!eligible) {
    return {
      eligible: false,
      reason: 'Calculated benefit is $0 or less',
      failedTests,
      grossIncome,
      netIncome,
      benefitAmount: 0,
      deductions,
      citedRules,
      calculationSteps: steps,
      expeditedEligible: false,
    };
  }

  return {
    eligible: true,
    failedTests,
    grossIncome,
    netIncome,
    benefitAmount,
    deductions,
    citedRules,
    calculationSteps: steps,
    expeditedEligible: false,
  };
}

// ── Private helpers ──────────────────────────────────────────────────────────

function buildDeductions(
  standardDeduction: number,
  earnedIncomeDeduction: number,
  dependentCareDeduction: number,
  childSupportDeduction: number,
  medicalDeduction: number,
  excessShelterDeduction: number,
  totalDeductions: number,
  shelterCostDetail: {
    rent: number;
    mortgage: number;
    propertyTax: number;
    insurance: number;
    condoFees: number;
    suaTier: SuaTier;
    suaAmount: number;
    totalShelterCosts: number;
  },
): DeductionBreakdown {
  return {
    standardDeduction,
    earnedIncomeDeduction,
    dependentCareDeduction,
    childSupportDeduction,
    medicalDeduction,
    excessShelterDeduction,
    totalDeductions,
    shelterCostDetail,
  };
}

function buildIneligibleOutput(
  grossIncome: number,
  failedTests: FailedTest[],
  citedRules: string[],
  calculationSteps: CalculationStep[],
  reason: string,
  deductions?: DeductionBreakdown,
  netIncome?: number,
): OracleOutput {
  return {
    eligible: false,
    reason,
    failedTests,
    grossIncome,
    netIncome: netIncome ?? 0,
    benefitAmount: 0,
    deductions: deductions ?? {
      standardDeduction: 0,
      earnedIncomeDeduction: 0,
      dependentCareDeduction: 0,
      childSupportDeduction: 0,
      medicalDeduction: 0,
      excessShelterDeduction: 0,
      totalDeductions: 0,
      shelterCostDetail: {
        rent: 0,
        mortgage: 0,
        propertyTax: 0,
        insurance: 0,
        condoFees: 0,
        suaTier: 'none',
        suaAmount: 0,
        totalShelterCosts: 0,
      },
    },
    citedRules,
    calculationSteps,
    expeditedEligible: false,
  };
}
