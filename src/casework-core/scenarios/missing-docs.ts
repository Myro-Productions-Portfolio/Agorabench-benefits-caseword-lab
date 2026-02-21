// ---------------------------------------------------------------------------
// Seeded scenario generator: missing-docs
// ---------------------------------------------------------------------------

import type { OracleInput, HouseholdMember, IncomeItem, ShelterCosts, SuaTier } from '../oracle';

export type MissingDocsVariant =
  | 'docs_arrive_on_time'
  | 'docs_arrive_late'
  | 'docs_never_arrive'
  | 'applicant_refuses';

export interface MissingDocsCase {
  caseIndex: number;
  applicantName: string;
  householdSize: number;
  requiredVerifications: string[];
  missingItems: string[];
  variant: MissingDocsVariant;
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

const VERIFICATION_ITEMS = [
  'identity',
  'residency',
  'income',
  'citizenship',
  'resources',
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Pick a random element from an array using the PRNG. */
function pick<T>(arr: readonly T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

/** Shuffle an array in-place (Fisher-Yates) using the PRNG, return it. */
function shuffle<T>(arr: T[], rand: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Map a 0-1 random value to a variant via cumulative thresholds. */
function pickVariant(rand: () => number): MissingDocsVariant {
  const r = rand();
  if (r < 0.40) return 'docs_arrive_on_time';
  if (r < 0.60) return 'docs_arrive_late';
  if (r < 0.80) return 'docs_never_arrive';
  return 'applicant_refuses';
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
// Financial data generator
// ---------------------------------------------------------------------------

function generateOracleInput(
  householdSize: number,
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

  // ── Income ─────────────────────────────────────────────────────────────
  const income: IncomeItem[] = [];

  // 80% chance of earned income
  if (rand() < 0.8) {
    const frequencies: Array<{ freq: IncomeItem['frequency']; divisor: number }> = [
      { freq: 'monthly', divisor: 1 },
      { freq: 'biweekly', divisor: 2.15 },
      { freq: 'weekly', divisor: 4.3 },
    ];
    const chosen = pick(frequencies, rand);
    const monthlyEquivalent = Math.floor(rand() * 2701) + 800; // $800-3500/mo
    const amount = Math.round(monthlyEquivalent / chosen.divisor);

    income.push({
      type: 'earned',
      amount,
      frequency: chosen.freq,
      source: 'employment',
      verified: true,
    });
  }

  // 30% chance of unearned income
  if (rand() < 0.3) {
    const amount = Math.floor(rand() * 1001) + 200; // $200-1200/mo
    income.push({
      type: 'unearned',
      amount,
      frequency: 'monthly',
      source: 'benefits',
      verified: true,
    });
  }

  // ── Resources ──────────────────────────────────────────────────────────
  const resources: { type: string; value: number; countable: boolean }[] = [];

  // 30% have savings
  if (rand() < 0.3) {
    resources.push({
      type: 'savings',
      value: Math.floor(rand() * 5001),
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

export function generateMissingDocsCases(
  count: number,
  seed: number,
): MissingDocsCase[] {
  const rand = mulberry32(seed);
  const cases: MissingDocsCase[] = [];

  for (let i = 0; i < count; i++) {
    const firstName = pick(FIRST_NAMES, rand);
    const lastName = pick(LAST_NAMES, rand);

    const householdSize = Math.floor(rand() * 6) + 1; // 1-6

    // 2-4 required verifications (pick count, then take first N from shuffled pool)
    const reqCount = Math.floor(rand() * 3) + 2; // 2, 3, or 4
    const shuffled = shuffle([...VERIFICATION_ITEMS], rand);
    const requiredVerifications = shuffled.slice(0, reqCount);

    // 1-2 missing items drawn from the required set
    const missingCount = Math.floor(rand() * 2) + 1; // 1 or 2
    const missingItems = shuffle([...requiredVerifications], rand).slice(
      0,
      missingCount,
    );

    const variant = pickVariant(rand);

    const oracleInput = generateOracleInput(householdSize, rand);

    cases.push({
      caseIndex: i,
      applicantName: `${firstName} ${lastName}`,
      householdSize,
      requiredVerifications,
      missingItems,
      variant,
      oracleInput,
    });
  }

  return cases;
}
