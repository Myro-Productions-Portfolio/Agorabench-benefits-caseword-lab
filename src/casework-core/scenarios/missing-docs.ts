// ---------------------------------------------------------------------------
// Seeded scenario generator: missing-docs
// ---------------------------------------------------------------------------

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

    cases.push({
      caseIndex: i,
      applicantName: `${firstName} ${lastName}`,
      householdSize,
      requiredVerifications,
      missingItems,
      variant,
    });
  }

  return cases;
}
