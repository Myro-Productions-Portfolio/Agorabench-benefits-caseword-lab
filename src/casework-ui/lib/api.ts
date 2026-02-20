import { API_PREFIX } from '@shared/constants';
import type { ApiResponse, ArtifactRecord, CaseRecord, EventRecord } from '@shared/types';

const BASE = API_PREFIX;

async function request<T>(path: string, options?: RequestInit): Promise<ApiResponse<T>> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

export const api = {
  getCases: () => request('/cases'),
  getCase: (id: string) => request(`/cases/${id}`),
  getCaseEvents: (id: string) => request(`/cases/${id}/events`),
  getCaseArtifacts: (caseId: string) => request<ArtifactRecord[]>(`/cases/${caseId}/artifacts`),
  getArtifact: (id: string) => request<ArtifactRecord>(`/artifacts/${id}`),
  getPolicyPack: () => request<{ meta: Record<string, string>; ruleIds: string[] }>('/policy-pack'),
  createCase: (citations: string[]) =>
    request<{ case: CaseRecord; event: EventRecord }>('/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ citations }),
    }),
  createEvent: (caseId: string, data: {
    action: string;
    actor: string;
    citations: string[];
    artifact?: { type: string; content: unknown };
  }) =>
    request(`/cases/${caseId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
};
