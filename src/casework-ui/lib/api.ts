import { API_PREFIX } from '@shared/constants';
import type { ApiResponse } from '@shared/types';

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
  createCase: () => request('/cases', { method: 'POST' }),
  createEvent: (caseId: string, body: { actor: string; action: string; payload?: unknown }) =>
    request(`/cases/${caseId}/events`, { method: 'POST', body: JSON.stringify(body) }),
};
