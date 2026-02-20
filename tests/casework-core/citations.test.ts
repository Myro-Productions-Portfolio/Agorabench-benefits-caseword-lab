// tests/casework-core/citations.test.ts
import { describe, it, expect } from 'vitest';
import { validateCitations } from '@core/citations';

const mockRuleIndex = new Set(['ELIG-GROSS-001', 'BEN-CALC-001', 'SLA-PROC-001', 'CFR-273']);

describe('validateCitations', () => {
  it('returns ok for valid ruleIds', () => {
    const result = validateCitations(['ELIG-GROSS-001', 'BEN-CALC-001'], mockRuleIndex);
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
  });

  it('returns error for unknown ruleIds', () => {
    const result = validateCitations(['ELIG-GROSS-001', 'FAKE-001'], mockRuleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['FAKE-001']);
  });

  it('returns error for empty citations array', () => {
    const result = validateCitations([], mockRuleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual([]);
    expect(result.error).toBe('At least one citation is required');
  });

  it('accepts slaIds and citationIds', () => {
    const result = validateCitations(['SLA-PROC-001', 'CFR-273'], mockRuleIndex);
    expect(result.valid).toBe(true);
  });

  it('returns all invalid ids when multiple are unknown', () => {
    const result = validateCitations(['FAKE-001', 'BOGUS-002'], mockRuleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['FAKE-001', 'BOGUS-002']);
  });
});
