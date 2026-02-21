import { describe, it, expect } from 'vitest';
import { generateMissingDocsCases } from '@core/scenarios/missing-docs';
import { runMissingDocsScenario } from '@core/runner';
import { computeRunSummary } from '@core/metrics';

describe('runs API logic', () => {
  it('100 cases produce valid summary', () => {
    const cases = generateMissingDocsCases(100, 42);
    const result = runMissingDocsScenario(cases);
    const summary = computeRunSummary(result);

    expect(summary.totalCases).toBe(100);
    expect(
      summary.byOutcome.approved +
        summary.byOutcome.denied +
        summary.byOutcome.abandoned,
    ).toBe(100);
    expect(summary.errors).toHaveLength(0);
  });

  it('different seeds produce different outcomes', () => {
    const a = computeRunSummary(
      runMissingDocsScenario(generateMissingDocsCases(50, 1)),
    );
    const b = computeRunSummary(
      runMissingDocsScenario(generateMissingDocsCases(50, 2)),
    );

    expect(
      a.byOutcome.approved !== b.byOutcome.approved ||
        a.byOutcome.denied !== b.byOutcome.denied,
    ).toBe(true);
  });
});
