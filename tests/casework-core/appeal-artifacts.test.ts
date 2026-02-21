import { describe, it, expect } from 'vitest';
import {
  AppealRequestSchema,
  HearingRecordSchema,
  AppealDecisionSchema,
} from '@core/artifacts/appeal-artifacts';

// ---------------------------------------------------------------------------
// AppealRequestSchema
// ---------------------------------------------------------------------------

describe('AppealRequestSchema', () => {
  const validRequest = {
    appealId: 'appeal-001',
    caseId: 'case-001',
    filedAt: '2026-02-15',
    reason: 'Incorrect income calculation',
    citedErrors: ['income_miscalculation', 'missing_deduction'],
    requestedRelief: 'Recalculate benefits with correct income',
  };

  it('parses a valid appeal request', () => {
    const result = AppealRequestSchema.safeParse(validRequest);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.appealId).toBe('appeal-001');
      expect(result.data.caseId).toBe('case-001');
      expect(result.data.citedErrors).toHaveLength(2);
    }
  });

  it('accepts empty citedErrors array', () => {
    const result = AppealRequestSchema.safeParse({
      ...validRequest,
      citedErrors: [],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const result = AppealRequestSchema.safeParse({
      appealId: 'appeal-001',
      // missing caseId, filedAt, reason, citedErrors, requestedRelief
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = AppealRequestSchema.safeParse({
      ...validRequest,
      reason: '',
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// HearingRecordSchema
// ---------------------------------------------------------------------------

describe('HearingRecordSchema', () => {
  const validRecord = {
    hearingId: 'hearing-001',
    caseId: 'case-001',
    scheduledAt: '2026-02-20',
    hearingDate: '2026-03-10',
    attendees: ['claimant', 'hearing_officer', 'caseworker'],
    evidencePresented: ['pay_stubs', 'tax_return'],
    findingsOfFact: ['Income was $2,400/month'],
  };

  it('parses a valid hearing record', () => {
    const result = HearingRecordSchema.safeParse(validRecord);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.hearingId).toBe('hearing-001');
      expect(result.data.attendees).toHaveLength(3);
    }
  });

  it('rejects empty attendees array', () => {
    const result = HearingRecordSchema.safeParse({
      ...validRecord,
      attendees: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts empty evidencePresented array', () => {
    const result = HearingRecordSchema.safeParse({
      ...validRecord,
      evidencePresented: [],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty findingsOfFact array', () => {
    const result = HearingRecordSchema.safeParse({
      ...validRecord,
      findingsOfFact: [],
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// AppealDecisionSchema
// ---------------------------------------------------------------------------

describe('AppealDecisionSchema', () => {
  const validDecision = {
    decisionId: 'decision-001',
    caseId: 'case-001',
    outcome: 'favorable' as const,
    reasoning: 'The agency miscalculated earned income deductions',
    citedRegulations: ['7 CFR 273.9(d)', '7 CFR 273.10(e)'],
    orderText: 'Benefits shall be recalculated from the original application date',
    implementationDeadline: '2026-04-01',
  };

  it('parses a valid favorable decision', () => {
    const result = AppealDecisionSchema.safeParse(validDecision);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe('favorable');
    }
  });

  it('parses a valid unfavorable decision', () => {
    const result = AppealDecisionSchema.safeParse({
      ...validDecision,
      outcome: 'unfavorable',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe('unfavorable');
    }
  });

  it('parses a valid remand decision', () => {
    const result = AppealDecisionSchema.safeParse({
      ...validDecision,
      outcome: 'remand',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.outcome).toBe('remand');
    }
  });

  it('rejects invalid outcome', () => {
    const result = AppealDecisionSchema.safeParse({
      ...validDecision,
      outcome: 'partial',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty citedRegulations array', () => {
    const result = AppealDecisionSchema.safeParse({
      ...validDecision,
      citedRegulations: [],
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = AppealDecisionSchema.safeParse({
      decisionId: 'decision-001',
      // missing other fields
    });
    expect(result.success).toBe(false);
  });
});
