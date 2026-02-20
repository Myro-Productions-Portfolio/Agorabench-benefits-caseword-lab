// src/casework-core/citations.ts

export interface CitationValidationResult {
  valid: boolean;
  invalid: string[];
  error?: string;
}

export function validateCitations(
  citations: string[],
  ruleIndex: Set<string>,
): CitationValidationResult {
  if (citations.length === 0) {
    return { valid: false, invalid: [], error: 'At least one citation is required' };
  }

  const invalid = citations.filter((id) => !ruleIndex.has(id));

  if (invalid.length > 0) {
    return { valid: false, invalid, error: `Unknown ruleIds: ${invalid.join(', ')}` };
  }

  return { valid: true, invalid: [] };
}
