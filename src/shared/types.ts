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
  citations: string[] | null;
  artifactId: string | null;
  createdAt: string;
}

export interface ArtifactRecord {
  id: string;
  caseId: string;
  eventId: string;
  type: string;
  content: Record<string, unknown>;
  citations: string[];
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

export interface RunSummaryRecord {
  totalCases: number;
  byVariant: Record<string, number>;
  byOutcome: { approved: number; denied: number; abandoned: number };
  slaCompliance: { onTime: number; breached: number; breachRate: number };
  averageTimeToDecision: number;
  noticeCompleteness: number;
  citationCoverage: number;
  errors: { caseId: string; error: string }[];
  oracleMetrics?: {
    casesEvaluated: number;
    eligibilityMatchRate: number;
    benefitExactMatchRate: number;
    averageBenefitDelta: number;
    mismatchCount: number;
    mismatchesBySeverity: Record<string, number>;
  };
  appealMetrics?: {
    casesAppealed: number;
    favorableRate: number;
    unfavorableRate: number;
    remandRate: number;
    avgTimeToDecision: number;
  };
}

export interface RunRecord {
  id: string;
  scenario: string;
  seed: number;
  count: number;
  summary: RunSummaryRecord | null;
  createdAt: string;
}
