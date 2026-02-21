import { z } from 'zod';

export const AppealRequestSchema = z.object({
  appealId: z.string().min(1),
  caseId: z.string().min(1),
  filedAt: z.string().min(1),
  reason: z.string().min(1),
  citedErrors: z.array(z.string()),
  requestedRelief: z.string().min(1),
});
export type AppealRequest = z.infer<typeof AppealRequestSchema>;

export const HearingRecordSchema = z.object({
  hearingId: z.string().min(1),
  caseId: z.string().min(1),
  scheduledAt: z.string().min(1),
  hearingDate: z.string().min(1),
  attendees: z.array(z.string()).min(1),
  evidencePresented: z.array(z.string()),
  findingsOfFact: z.array(z.string()),
});
export type HearingRecord = z.infer<typeof HearingRecordSchema>;

export const AppealDecisionSchema = z.object({
  decisionId: z.string().min(1),
  caseId: z.string().min(1),
  outcome: z.enum(['favorable', 'unfavorable', 'remand']),
  reasoning: z.string().min(1),
  citedRegulations: z.array(z.string()).min(1),
  orderText: z.string().min(1),
  implementationDeadline: z.string().min(1),
});
export type AppealDecision = z.infer<typeof AppealDecisionSchema>;
