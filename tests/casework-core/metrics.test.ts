import { describe, it, expect } from 'vitest';
import { computeRunSummary } from '@core/metrics';
import { runMissingDocsScenario, runAppealReversalScenario } from '@core/runner';
import { generateMissingDocsCases } from '@core/scenarios/missing-docs';
import { generateAppealReversalCases } from '@core/scenarios/appeal-reversal';

describe('run metrics', () => {
  const cases100 = generateMissingDocsCases(100, 42);
  const result = runMissingDocsScenario(cases100);
  const summary = computeRunSummary(result);

  it('totalCases matches', () => {
    expect(summary.totalCases).toBe(100);
  });

  it('byVariant sums to totalCases', () => {
    const sum = Object.values(summary.byVariant).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it('byOutcome sums to totalCases', () => {
    const { approved, denied, abandoned } = summary.byOutcome;
    expect(approved + denied + abandoned).toBe(100);
  });

  it('slaCompliance has valid breachRate', () => {
    expect(summary.slaCompliance.breachRate).toBeGreaterThanOrEqual(0);
    expect(summary.slaCompliance.breachRate).toBeLessThanOrEqual(1);
    expect(summary.slaCompliance.onTime + summary.slaCompliance.breached).toBe(100);
  });

  it('averageTimeToDecision is positive for decided cases', () => {
    expect(summary.averageTimeToDecision).toBeGreaterThan(0);
  });

  it('citationCoverage is 1.0 (all events have citations)', () => {
    expect(summary.citationCoverage).toBe(1);
  });

  it('errors is empty', () => {
    expect(summary.errors).toHaveLength(0);
  });

  it('breachRate > 0 because some variants breach SLA', () => {
    expect(summary.slaCompliance.breached).toBeGreaterThan(0);
  });

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

  describe('appeal metrics', () => {
    it('appeal scenario produces valid appealMetrics', () => {
      const appealCases = generateAppealReversalCases(50, 42);
      const appealResult = runAppealReversalScenario(appealCases);
      const appealSummary = computeRunSummary(appealResult);

      expect(appealSummary.appealMetrics).toBeDefined();
      const am = appealSummary.appealMetrics!;
      expect(am.casesAppealed).toBe(50);

      // Rates sum to ~1.0
      const rateSum = am.favorableRate + am.unfavorableRate + am.remandRate;
      expect(rateSum).toBeCloseTo(1.0, 5);

      // Each rate is between 0 and 1
      expect(am.favorableRate).toBeGreaterThanOrEqual(0);
      expect(am.favorableRate).toBeLessThanOrEqual(1);
      expect(am.unfavorableRate).toBeGreaterThanOrEqual(0);
      expect(am.unfavorableRate).toBeLessThanOrEqual(1);
      expect(am.remandRate).toBeGreaterThanOrEqual(0);
      expect(am.remandRate).toBeLessThanOrEqual(1);

      // avgTimeToDecision is positive
      expect(am.avgTimeToDecision).toBeGreaterThan(0);
    });

    it('missing-docs scenario does NOT have appealMetrics', () => {
      const mdCases = generateMissingDocsCases(50, 42);
      const mdResult = runMissingDocsScenario(mdCases);
      const mdSummary = computeRunSummary(mdResult);

      expect(mdSummary.appealMetrics).toBeUndefined();
    });
  });
});
