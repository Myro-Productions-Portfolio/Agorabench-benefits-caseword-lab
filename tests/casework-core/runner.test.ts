import { describe, it, expect } from 'vitest';
import { generateMissingDocsCases } from '@core/scenarios/missing-docs';
import { generateAppealReversalCases } from '@core/scenarios/appeal-reversal';
import { runMissingDocsScenario, runAppealReversalScenario } from '@core/runner';
import type { RunResult, CaseResult } from '@core/runner';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEED = 42;

function runN(count: number): RunResult {
  const cases = generateMissingDocsCases(count, SEED);
  return runMissingDocsScenario(cases);
}

function casesByVariant(result: RunResult, variant: string): CaseResult[] {
  return result.caseResults.filter((c) => c.variant === variant);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runMissingDocsScenario', () => {
  it('runs 10 cases and returns a RunResult with correct totalCases and no errors', () => {
    const result = runN(10);
    expect(result.totalCases).toBe(10);
    expect(result.caseResults).toHaveLength(10);
    expect(result.errors).toHaveLength(0);
    expect(result.runId).toBeTruthy();
  });

  it('each case reaches CLOSED as finalState', () => {
    const result = runN(10);
    for (const cr of result.caseResults) {
      expect(cr.finalState).toBe('CLOSED');
    }
  });

  it('docs_arrive_on_time cases end as outcome="approved"', () => {
    const result = runN(50);
    const onTime = casesByVariant(result, 'docs_arrive_on_time');
    expect(onTime.length).toBeGreaterThan(0);
    for (const cr of onTime) {
      expect(cr.outcome).toBe('approved');
    }
  });

  it('applicant_refuses cases end as outcome="denied"', () => {
    const result = runN(50);
    const refused = casesByVariant(result, 'applicant_refuses');
    expect(refused.length).toBeGreaterThan(0);
    for (const cr of refused) {
      expect(cr.outcome).toBe('denied');
    }
  });

  it('docs_never_arrive cases end as outcome="abandoned"', () => {
    const result = runN(50);
    const neverArrive = casesByVariant(result, 'docs_never_arrive');
    expect(neverArrive.length).toBeGreaterThan(0);
    for (const cr of neverArrive) {
      expect(cr.outcome).toBe('abandoned');
    }
  });

  it('all events have non-empty citations', () => {
    const result = runN(20);
    for (const cr of result.caseResults) {
      for (const ev of cr.events) {
        expect(ev.citations.length).toBeGreaterThan(0);
      }
    }
  });

  it('100 cases complete without errors', () => {
    const result = runN(100);
    expect(result.errors).toHaveLength(0);
    expect(result.caseResults).toHaveLength(100);
  });

  it('docs_arrive_late cases have SLA-PROC-001 breach', () => {
    const result = runN(50);
    const late = casesByVariant(result, 'docs_arrive_late');
    expect(late.length).toBeGreaterThan(0);
    for (const cr of late) {
      expect(cr.slaBreaches).toContain('SLA-PROC-001');
    }
  });

  it('each case has at least 2 events', () => {
    const result = runN(20);
    for (const cr of result.caseResults) {
      expect(cr.events.length).toBeGreaterThanOrEqual(2);
    }
  });

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

    it('denied cases have oracleOutput', () => {
      const cases = generateMissingDocsCases(50, 42);
      const result = runMissingDocsScenario(cases);
      const denied = result.caseResults.filter(c => c.outcome === 'denied');
      expect(denied.length).toBeGreaterThan(0);
      for (const c of denied) {
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

    it('oracle comparison has correct structure', () => {
      const cases = generateMissingDocsCases(20, 42);
      const result = runMissingDocsScenario(cases);
      const withComparison = result.caseResults.filter(c => c.oracleComparison);
      expect(withComparison.length).toBeGreaterThan(0);
      for (const c of withComparison) {
        expect(typeof c.oracleComparison!.eligibilityMatch).toBe('boolean');
        expect(typeof c.oracleComparison!.benefitDelta).toBe('number');
        expect(typeof c.oracleComparison!.citationsCovered).toBe('boolean');
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Appeal Reversal Runner
// ---------------------------------------------------------------------------

describe('runAppealReversalScenario', () => {
  const SEED = 42;

  function runAppealN(count: number): RunResult {
    const cases = generateAppealReversalCases(count, SEED);
    return runAppealReversalScenario(cases);
  }

  function appealCasesByVariant(result: RunResult, variant: string): CaseResult[] {
    return result.caseResults.filter((c) => c.variant === variant);
  }

  it('runs 10 cases with no errors', () => {
    const result = runAppealN(10);
    expect(result.totalCases).toBe(10);
    expect(result.caseResults).toHaveLength(10);
    expect(result.errors).toHaveLength(0);
    expect(result.runId).toBeTruthy();
  });

  it('each case reaches CLOSED as finalState', () => {
    const result = runAppealN(10);
    for (const cr of result.caseResults) {
      expect(cr.finalState).toBe('CLOSED');
    }
  });

  it('favorable_reversal cases are approved with expected events', () => {
    const result = runAppealN(50);
    const favorable = appealCasesByVariant(result, 'favorable_reversal');
    expect(favorable.length).toBeGreaterThan(0);
    for (const cr of favorable) {
      expect(cr.outcome).toBe('approved');
      const actions = cr.events.map(e => e.action);
      expect(actions).toContain('appeal_filed');
      expect(actions).toContain('schedule_hearing');
      expect(actions).toContain('render_decision');
      expect(actions).toContain('implement_favorable');
    }
  });

  it('unfavorable_upheld cases end denied', () => {
    const result = runAppealN(50);
    const upheld = appealCasesByVariant(result, 'unfavorable_upheld');
    expect(upheld.length).toBeGreaterThan(0);
    for (const cr of upheld) {
      expect(cr.outcome).toBe('denied');
    }
  });

  it('remand_reopened cases end approved with reopen_case and approve events', () => {
    const result = runAppealN(50);
    const remand = appealCasesByVariant(result, 'remand_reopened');
    expect(remand.length).toBeGreaterThan(0);
    for (const cr of remand) {
      expect(cr.outcome).toBe('approved');
      const actions = cr.events.map(e => e.action);
      expect(actions).toContain('reopen_case');
      expect(actions).toContain('approve');
    }
  });

  it('all events have non-empty citations', () => {
    const result = runAppealN(20);
    for (const cr of result.caseResults) {
      for (const ev of cr.events) {
        expect(ev.citations.length).toBeGreaterThan(0);
      }
    }
  });

  it('100 cases complete without errors', () => {
    const result = runAppealN(100);
    expect(result.errors).toHaveLength(0);
    expect(result.caseResults).toHaveLength(100);
  });

  it('appeal cases have oracleOutput', () => {
    const result = runAppealN(20);
    for (const cr of result.caseResults) {
      expect(cr.oracleOutput).toBeDefined();
      expect(cr.oracleComparison).toBeDefined();
    }
  });
});
