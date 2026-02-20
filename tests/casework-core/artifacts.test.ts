import { describe, it, expect } from 'vitest';
import {
  verificationRequestSchema,
  determinationWorksheetSchema,
  noticeSchema,
  validateArtifact,
  ARTIFACT_TYPES,
} from '@core/artifacts';

describe('verificationRequestSchema', () => {
  it('accepts valid verification request', () => {
    const result = verificationRequestSchema.safeParse({
      missingItems: ['identity', 'gross_nonexempt_income'],
      deadline: '2026-03-05',
      consequences: 'Application may be denied if documents are not received by the deadline.',
      assistanceObligation: 'The agency will assist you in obtaining required documents.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects verification request without missingItems', () => {
    const result = verificationRequestSchema.safeParse({
      deadline: '2026-03-05',
      consequences: 'text',
      assistanceObligation: 'text',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty missingItems array', () => {
    const result = verificationRequestSchema.safeParse({
      missingItems: [],
      deadline: '2026-03-05',
      consequences: 'text',
      assistanceObligation: 'text',
    });
    expect(result.success).toBe(false);
  });
});

describe('determinationWorksheetSchema', () => {
  it('accepts valid approved worksheet', () => {
    const result = determinationWorksheetSchema.safeParse({
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

  it('accepts valid denied worksheet with reason', () => {
    const result = determinationWorksheetSchema.safeParse({
      eligible: false,
      grossIncome: 5000,
      netIncome: 4500,
      benefitAmount: 0,
      deductions: {
        standard: 205,
        earnedIncome: 0,
        dependentCare: 0,
        childSupport: 0,
        medical: 0,
        excessShelter: 0,
      },
      reason: 'Gross income exceeds 165% FPL for household size 3',
    });
    expect(result.success).toBe(true);
  });

  it('rejects worksheet missing deductions', () => {
    const result = determinationWorksheetSchema.safeParse({
      eligible: true,
      grossIncome: 2500,
      netIncome: 1800,
      benefitAmount: 450,
    });
    expect(result.success).toBe(false);
  });
});

describe('noticeSchema', () => {
  it('accepts valid approval notice', () => {
    const result = noticeSchema.safeParse({
      noticeType: 'approval',
      recipientName: 'Jane Doe',
      noticeDate: '2026-02-25',
      fields: {
        benefit_amount: '$450',
        certification_period: '2026-03 to 2026-08',
        fair_hearing_rights: 'You have the right to request a fair hearing within 90 days.',
      },
      templateId: 'approval-notice',
    });
    expect(result.success).toBe(true);
  });

  it('rejects notice with invalid noticeType', () => {
    const result = noticeSchema.safeParse({
      noticeType: 'warning',
      recipientName: 'Jane Doe',
      noticeDate: '2026-02-25',
      fields: {},
      templateId: 'test',
    });
    expect(result.success).toBe(false);
  });
});

describe('validateArtifact', () => {
  it('validates correct type and content', () => {
    const result = validateArtifact('verification_request', {
      missingItems: ['identity'],
      deadline: '2026-03-05',
      consequences: 'Denial',
      assistanceObligation: 'Agency will help',
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown artifact type', () => {
    const result = validateArtifact('unknown_type', { foo: 'bar' });
    expect(result.success).toBe(false);
  });

  it('rejects content that does not match schema for type', () => {
    const result = validateArtifact('notice', { missingItems: ['identity'] });
    expect(result.success).toBe(false);
  });
});
