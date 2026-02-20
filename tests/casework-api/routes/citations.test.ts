// tests/casework-api/routes/citations.test.ts
import { describe, it, expect } from 'vitest';
import { validateCitations } from '@core/citations';
import { validateArtifact } from '@core/artifacts';

describe('citation enforcement integration', () => {
  const ruleIndex = new Set([
    'ELIG-GROSS-001',
    'VER-MAND-001',
    'NOT-VER-001',
    'BEN-CALC-001',
  ]);

  it('rejects action with no citations', () => {
    const result = validateCitations([], ruleIndex);
    expect(result.valid).toBe(false);
    expect(result.error).toBe('At least one citation is required');
  });

  it('accepts action with valid citations', () => {
    const result = validateCitations(['ELIG-GROSS-001'], ruleIndex);
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
  });

  it('accepts action with multiple valid citations', () => {
    const result = validateCitations(
      ['ELIG-GROSS-001', 'BEN-CALC-001', 'VER-MAND-001'],
      ruleIndex,
    );
    expect(result.valid).toBe(true);
    expect(result.invalid).toEqual([]);
  });

  it('rejects action with unknown citation ids', () => {
    const result = validateCitations(['ELIG-GROSS-001', 'FAKE-999'], ruleIndex);
    expect(result.valid).toBe(false);
    expect(result.invalid).toEqual(['FAKE-999']);
  });

  it('validates artifact content matches type', () => {
    const result = validateArtifact('verification_request', {
      missingItems: ['identity'],
      deadline: '2026-03-05',
      consequences: 'Denial if not received',
      assistanceObligation: 'Agency will help',
    });
    expect(result.success).toBe(true);
  });

  it('rejects artifact with wrong content for type', () => {
    const result = validateArtifact('verification_request', {
      noticeType: 'approval',
    });
    expect(result.success).toBe(false);
  });

  it('rejects artifact with unknown type', () => {
    const result = validateArtifact('nonexistent_type', {
      foo: 'bar',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain('Unknown artifact type');
    }
  });

  it('validates determination_worksheet artifact', () => {
    const result = validateArtifact('determination_worksheet', {
      eligible: true,
      grossIncome: 2500,
      netIncome: 1800,
      benefitAmount: 450,
      deductions: {
        standard: 205,
        earnedIncome: 300,
        dependentCare: 0,
        childSupport: 0,
        medical: 0,
        excessShelter: 195,
      },
    });
    expect(result.success).toBe(true);
  });

  it('validates notice artifact', () => {
    const result = validateArtifact('notice', {
      noticeType: 'approval',
      recipientName: 'Jane Doe',
      noticeDate: '2026-02-25',
      fields: { benefit_amount: '$450' },
      templateId: 'approval-notice',
    });
    expect(result.success).toBe(true);
  });
});
