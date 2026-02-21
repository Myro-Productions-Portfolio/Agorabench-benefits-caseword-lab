import { describe, it, expect } from 'vitest';
import { computeRunSummary } from '@core/metrics';
import { runMissingDocsScenario } from '@core/runner';
import { generateMissingDocsCases } from '@core/scenarios/missing-docs';

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
});
