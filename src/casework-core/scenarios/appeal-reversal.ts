// ---------------------------------------------------------------------------
// Seeded scenario generator: appeal-reversal
// ---------------------------------------------------------------------------

import type { OracleInput, HouseholdMember, IncomeItem, ShelterCosts, SuaTier } from '../oracle';

export type AppealReversalVariant =
  | 'favorable_reversal'
  | 'unfavorable_upheld'
  | 'remand_reopened';

export interface AppealReversalCase {
  caseIndex: number;
  applicantName: string;
  householdSize: number;
  variant: AppealReversalVariant;
  denialReason: string;
  appealReason: string;
  oracleInput?: OracleInput;
}

// ---------------------------------------------------------------------------
// Seeded PRNG -- mulberry32
// ---------------------------------------------------------------------------

function mulberry32(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Data pools
// ---------------------------------------------------------------------------

const FIRST_NAMES = [
  'Maria', 'James', 'Patricia', 'Robert', 'Linda',
  'Michael', 'Barbara', 'William', 'Elizabeth', 'David',
  'Jennifer', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Daniel',
] as const;

const LAST_NAMES = [
  'Garcia', 'Smith', 'Johnson', 'Williams', 'Brown',
  'Jones', 'Davis', 'Martinez', 'Rodriguez', 'Wilson',
  'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson',
  'Martin', 'Lee', 'Perez', 'Thompson', 'White',
] as const;

const DENIAL_REASONS = [
  'Gross income exceeds 130% FPL',
  'Net income exceeds 100% FPL',
  'Countable resources exceed limit',
  'Failed to meet work requirements',
  'Incomplete verification within deadline',
] as const;

const APPEAL_REASONS = [
  'Income was miscalculated',
  'Verification documents were submitted but not processed',
  'Household composition was incorrect',
  'Medical expenses were not properly deducted',
  'Work requirement exemption should apply',
  'Shelter costs were not fully accounted for',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random element from an array using the PRNG. */
function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Map a 0-1 random value to a variant via cumulative thresholds. */
function pickVariant(rand: () => number): AppealReversalVariant {
  const r = rand();
  if (r < 0.50) return 'favorable_reversal';
  if (r < 0.80) return 'unfavorable_upheld';
  return 'remand_reopened';
}

// ---------------------------------------------------------------------------
// SUA tier pool
// ---------------------------------------------------------------------------

const SUA_TIERS: SuaTier[] = [
  'heatingCooling',
  'limitedUtility',
  'singleUtility',
  'telephoneOnly',
  'none',
];

// ---------------------------------------------------------------------------
// Financial data generator -- tuned per variant
// ---------------------------------------------------------------------------

function generateOracleInput(
  householdSize: number,
  variant: AppealReversalVariant,
  rand: () => number,
): OracleInput {
  // ── Household members ──────────────────────────────────────────────────
  const householdMembers: HouseholdMember[] = [];
  for (let i = 0; i < householdSize; i++) {
    const age =
      i === 0
        ? Math.floor(rand() * 50) + 18 // Head of household: 18-67
        : Math.floor(rand() * 80) + 1; // Others: 1-80
    const isDisabled = rand() < 0.08;
    const isStudent = age >= 18 && age <= 24 && rand() < 0.15;

    householdMembers.push({
      age,
      isDisabled,
      isStudent,
      citizenshipStatus: 'citizen',
    });
  }

  // ── Income (tuned per variant) ──────────────────────────────────────────
  const income: IncomeItem[] = [];

  const frequencies: Array<{ freq: IncomeItem['frequency']; divisor: number }> = [
    { freq: 'monthly', divisor: 1 },
    { freq: 'biweekly', divisor: 2.15 },
    { freq: 'weekly', divisor: 4.3 },
  ];
  const chosen = pick(frequencies, rand);

  let monthlyEquivalent: number;

  if (variant === 'unfavorable_upheld') {
    // High income: $3000-5000/mo so oracle says ineligible
    monthlyEquivalent = Math.floor(rand() * 2001) + 3000;
  } else {
    // Low-moderate income: $400-1600/mo so oracle says eligible
    monthlyEquivalent = Math.floor(rand() * 1201) + 400;
  }

  const amount = Math.round(monthlyEquivalent / chosen.divisor);

  income.push({
    type: 'earned',
    amount,
    frequency: chosen.freq,
    source: 'employment',
    verified: true,
  });

  // 25% chance of unearned income
  if (rand() < 0.25) {
    const unearnedAmount = Math.floor(rand() * 401) + 100; // $100-500/mo
    income.push({
      type: 'unearned',
      amount: unearnedAmount,
      frequency: 'monthly',
      source: 'benefits',
      verified: true,
    });
  }

  // ── Resources ──────────────────────────────────────────────────────────
  const resources: { type: string; value: number; countable: boolean }[] = [];

  // 20% have savings
  if (rand() < 0.2) {
    resources.push({
      type: 'savings',
      value: Math.floor(rand() * 3001),
      countable: true,
    });
  }

  // ── Shelter costs ──────────────────────────────────────────────────────
  const suaTier = pick(SUA_TIERS, rand);
  const shelterCosts: ShelterCosts = {
    suaTier,
  };

  // 75% have rent
  if (rand() < 0.75) {
    shelterCosts.rent = Math.floor(rand() * 1201) + 400; // $400-1600
  }

  // ── Optional expenses ──────────────────────────────────────────────────
  const hasElderlyOrDisabled = householdMembers.some(
    (m) => m.age >= 60 || m.isDisabled,
  );

  let medicalExpenses: number | undefined;
  if (hasElderlyOrDisabled && rand() < 0.4) {
    medicalExpenses = Math.floor(rand() * 301) + 35; // $35-335
  }

  const hasChildrenUnder13 = householdMembers.some((m) => m.age < 13);
  let dependentCareCosts: number | undefined;
  if (hasChildrenUnder13 && rand() < 0.3) {
    dependentCareCosts = Math.floor(rand() * 501) + 50; // $50-550
  }

  let childSupportPaid: number | undefined;
  if (rand() < 0.1) {
    childSupportPaid = Math.floor(rand() * 401) + 50; // $50-450
  }

  return {
    householdSize,
    householdMembers,
    income,
    resources,
    shelterCosts,
    medicalExpenses,
    dependentCareCosts,
    childSupportPaid,
    applicationDate: '2026-01-15',
    policyPackId: 'snap-illinois-fy2026-v1',
  };
}

// ---------------------------------------------------------------------------
// Generator
// ---------------------------------------------------------------------------

export function generateAppealReversalCases(
  count: number,
  seed: number,
): AppealReversalCase[] {
  const rand = mulberry32(seed);
  const cases: AppealReversalCase[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES, rand);
    const lastName = pick(LAST_NAMES, rand);

    const householdSize = Math.floor(rand() * 6) + 1; // 1-6

    const variant = pickVariant(rand);
    const denialReason = pick(DENIAL_REASONS, rand);
    const appealReason = pick(APPEAL_REASONS, rand);

    const oracleInput = generateOracleInput(householdSize, variant, rand);

    cases.push({
      caseIndex: i,
      applicantName: `${firstName} ${lastName}`,
      householdSize,
      variant,
      denialReason,
      appealReason,
      oracleInput,
    });
  }

  return cases;
}
