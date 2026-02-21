import { describe, it, expect } from 'vitest';
import {
  generateAppealReversalCases,
  type AppealReversalCase,
  type AppealReversalVariant,
} from '@core/scenarios/appeal-reversal';

// ---------------------------------------------------------------------------
// Valid variant set
// ---------------------------------------------------------------------------

const VALID_VARIANTS: AppealReversalVariant[] = [
  'favorable_reversal',
  'unfavorable_upheld',
  'remand_reopened',
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('generateAppealReversalCases', () => {
  it('generates the requested number of cases', () => {
    const cases = generateAppealReversalCases(50, 42);
    expect(cases).toHaveLength(50);
  });

  it('is deterministic with the same seed', () => {
    const a = generateAppealReversalCases(50, 123);
    const b = generateAppealReversalCases(50, 123);
    expect(a).toEqual(b);
  });

  it('produces different results with different seeds', () => {
    const a = generateAppealReversalCases(20, 111);
    const b = generateAppealReversalCases(20, 222);

    // At least one case should differ (overwhelmingly likely)
    const identical = a.every(
      (c, i) => c.applicantName === b[i].applicantName && c.variant === b[i].variant,
    );
    expect(identical).toBe(false);
  });

  it('each case has all required fields with valid values', () => {
    const cases = generateAppealReversalCases(50, 999);

    for (const c of cases) {
      // applicantName is "First Last"
      expect(c.applicantName).toMatch(/^\S+ \S+$/);

      // householdSize 1-6
      expect(c.householdSize).toBeGreaterThanOrEqual(1);
      expect(c.householdSize).toBeLessThanOrEqual(6);

      // valid variant
      expect(VALID_VARIANTS).toContain(c.variant);

      // denialReason and appealReason are non-empty strings
      expect(c.denialReason.length).toBeGreaterThan(0);
      expect(c.appealReason.length).toBeGreaterThan(0);
    }
  });

  it('variant distribution is roughly correct for 100 cases', () => {
    const cases = generateAppealReversalCases(100, 7777);

    const counts: Record<AppealReversalVariant, number> = {
      favorable_reversal: 0,
      unfavorable_upheld: 0,
      remand_reopened: 0,
    };

    for (const c of cases) {
      counts[c.variant]++;
    }

    // favorable_reversal ~50% => expect 30-70
    expect(counts.favorable_reversal).toBeGreaterThanOrEqual(30);
    expect(counts.favorable_reversal).toBeLessThanOrEqual(70);

    // unfavorable_upheld ~30% => expect 15+
    expect(counts.unfavorable_upheld).toBeGreaterThanOrEqual(15);

    // remand_reopened ~20% => expect 8+
    expect(counts.remand_reopened).toBeGreaterThanOrEqual(8);
  });

  it('caseIndex is sequential starting at 0', () => {
    const cases = generateAppealReversalCases(30, 456);
    for (let i = 0; i < cases.length; i++) {
      expect(cases[i].caseIndex).toBe(i);
    }
  });

  describe('financial data generation', () => {
    it('every case has valid oracleInput', () => {
      const cases = generateAppealReversalCases(50, 42);
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

    it('favorable/remand variants have low-moderate income', () => {
      const cases = generateAppealReversalCases(100, 42);
      const eligibleVariants = cases.filter(
        c => c.variant === 'favorable_reversal' || c.variant === 'remand_reopened',
      );
      expect(eligibleVariants.length).toBeGreaterThan(0);

      for (const c of eligibleVariants) {
        const earnedIncome = c.oracleInput!.income
          .filter(i => i.type === 'earned')
          .reduce((s, i) => {
            // Convert to monthly for comparison
            if (i.frequency === 'weekly') return s + i.amount * 4.3;
            if (i.frequency === 'biweekly') return s + i.amount * 2.15;
            return s + i.amount;
          }, 0);
        // Should be in the $400-1600 range (with some tolerance for rounding)
        expect(earnedIncome).toBeLessThanOrEqual(1700);
      }
    });

    it('unfavorable_upheld variants have high income', () => {
      const cases = generateAppealReversalCases(100, 42);
      const upheld = cases.filter(c => c.variant === 'unfavorable_upheld');
      expect(upheld.length).toBeGreaterThan(0);

      for (const c of upheld) {
        const earnedIncome = c.oracleInput!.income
          .filter(i => i.type === 'earned')
          .reduce((s, i) => {
            if (i.frequency === 'weekly') return s + i.amount * 4.3;
            if (i.frequency === 'biweekly') return s + i.amount * 2.15;
            return s + i.amount;
          }, 0);
        // Should be in the $3000-5000 range
        expect(earnedIncome).toBeGreaterThanOrEqual(2900);
      }
    });

    it('deterministic: same seed produces same financial data', () => {
      const a = generateAppealReversalCases(20, 99);
      const b = generateAppealReversalCases(20, 99);
      for (let i = 0; i < 20; i++) {
        expect(a[i].oracleInput!.income).toEqual(b[i].oracleInput!.income);
        expect(a[i].oracleInput!.shelterCosts).toEqual(b[i].oracleInput!.shelterCosts);
      }
    });
  });
});
