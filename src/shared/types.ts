import type { CASE_STATUSES, EVENT_ACTIONS, WS_EVENTS } from './constants';

export type CaseStatus = (typeof CASE_STATUSES)[number];
export type EventAction = (typeof EVENT_ACTIONS)[number];

export interface CaseRecord {
  id: string;
  program: string;
  jurisdiction: string | null;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
}

export interface EventRecord {
  id: string;
  caseId: string;
  actor: string;
  action: EventAction;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface WsMessage {
  event: (typeof WS_EVENTS)[keyof typeof WS_EVENTS];
  data: unknown;
  timestamp: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
