import { describe, it, expect } from 'vitest';
import {
  generateMissingDocsCases,
  type MissingDocsCase,
  type MissingDocsVariant,
} from '@core/scenarios/missing-docs';

// ---------------------------------------------------------------------------
// Valid variant set
// ---------------------------------------------------------------------------

const VALID_VARIANTS: MissingDocsVariant[] = [
  'docs_arrive_on_time',
  'docs_arrive_late',
  'docs_never_arrive',
  'applicant_refuses',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateMissingDocsCases', () => {
  it('generates the requested number of cases', () => {
    const cases = generateMissingDocsCases(50, 42);
    expect(cases).toHaveLength(50);
  });

  it('is deterministic with the same seed', () => {
    const a = generateMissingDocsCases(50, 123);
    const b = generateMissingDocsCases(50, 123);
    expect(a).toEqual(b);
  });

  it('produces different results with different seeds', () => {
    const a = generateMissingDocsCases(20, 111);
    const b = generateMissingDocsCases(20, 222);

    // At least one case should differ (overwhelmingly likely)
    const identical = a.every(
      (c, i) => c.applicantName === b[i].applicantName && c.variant === b[i].variant,
    );
    expect(identical).toBe(false);
  });

  it('each case has all required fields with valid values', () => {
    const cases = generateMissingDocsCases(50, 999);

    for (const c of cases) {
      // applicantName is "First Last"
      expect(c.applicantName).toMatch(/^\S+ \S+$/);

      // householdSize 1-6
      expect(c.householdSize).toBeGreaterThanOrEqual(1);
      expect(c.householdSize).toBeLessThanOrEqual(6);

      // requiredVerifications non-empty
      expect(c.requiredVerifications.length).toBeGreaterThan(0);

      // missingItems non-empty and subset of requiredVerifications
      expect(c.missingItems.length).toBeGreaterThan(0);
      for (const item of c.missingItems) {
        expect(c.requiredVerifications).toContain(item);
      }

      // valid variant
      expect(VALID_VARIANTS).toContain(c.variant);
    }
  });

  it('variant distribution is roughly correct for 100 cases', () => {
    const cases = generateMissingDocsCases(100, 7777);

    const counts: Record<MissingDocsVariant, number> = {
      docs_arrive_on_time: 0,
      docs_arrive_late: 0,
      docs_never_arrive: 0,
      applicant_refuses: 0,
    };

    for (const c of cases) {
      counts[c.variant]++;
    }

    // Each bucket should have more than 5 cases (expected ~20-40 each)
    for (const variant of VALID_VARIANTS) {
      expect(counts[variant]).toBeGreaterThan(5);
    }

    // docs_arrive_on_time is the largest bucket at 40% -- expect 25-55
    expect(counts.docs_arrive_on_time).toBeGreaterThanOrEqual(25);
    expect(counts.docs_arrive_on_time).toBeLessThanOrEqual(55);
  });

  it('caseIndex is sequential starting at 0', () => {
    const cases = generateMissingDocsCases(30, 456);
    for (let i = 0; i < cases.length; i++) {
      expect(cases[i].caseIndex).toBe(i);
    }
  });
});
