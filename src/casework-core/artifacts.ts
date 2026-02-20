import { z } from 'zod';

export const ARTIFACT_TYPES = [
  'verification_request',
  'determination_worksheet',
  'notice',
] as const;

export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const verificationRequestSchema = z.object({
  missingItems: z.array(z.string()).min(1),
  deadline: z.string(),
  consequences: z.string(),
  assistanceObligation: z.string(),
});

export const determinationWorksheetSchema = z.object({
  eligible: z.boolean(),
  grossIncome: z.number(),
  netIncome: z.number(),
  benefitAmount: z.number(),
  deductions: z.object({
    standard: z.number(),
    earnedIncome: z.number(),
    dependentCare: z.number(),
    childSupport: z.number(),
    medical: z.number(),
    excessShelter: z.number(),
  }),
  reason: z.string().optional(),
});

export const noticeSchema = z.object({
  noticeType: z.enum(['approval', 'denial']),
  recipientName: z.string(),
  noticeDate: z.string(),
  fields: z.record(z.string(), z.string()),
  templateId: z.string(),
});

export type VerificationRequest = z.infer<typeof verificationRequestSchema>;
export type DeterminationWorksheet = z.infer<typeof determinationWorksheetSchema>;
export type Notice = z.infer<typeof noticeSchema>;

const schemaMap: Record<string, z.ZodSchema> = {
  verification_request: verificationRequestSchema,
  determination_worksheet: determinationWorksheetSchema,
  notice: noticeSchema,
};

export function validateArtifact(
  type: string,
  content: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const schema = schemaMap[type];
  if (!schema) {
    return { success: false, error: `Unknown artifact type: ${type}` };
  }
  const result = schema.safeParse(content);
  if (!result.success) {
    return { success: false, error: result.error.message };
  }
  return { success: true, data: result.data };
}
