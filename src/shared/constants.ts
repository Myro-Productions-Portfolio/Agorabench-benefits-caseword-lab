export const API_PREFIX = '/api';

export const WS_EVENTS = {
  CONNECTION_ESTABLISHED: 'connection_established',
  HEARTBEAT: 'heartbeat',
  EVENT_CREATED: 'event_created',
} as const;

export const CASE_STATUSES = [
  'RECEIVED',
  'PENDING_VERIFICATION',
  'READY_FOR_DETERMINATION',
  'DETERMINED_APPROVED',
  'DETERMINED_DENIED',
  'NOTICE_SENT',
  'APPEAL_REQUESTED',
  'APPEAL_DECIDED',
  'IMPLEMENTED',
] as const;

export const EVENT_ACTIONS = [
  'CASE_CREATED',
  'STATUS_CHANGED',
  'DOCUMENT_REQUESTED',
  'DOCUMENT_RECEIVED',
  'DETERMINATION_MADE',
  'NOTICE_GENERATED',
  'APPEAL_FILED',
  'APPEAL_DECIDED',
] as const;

export const ARTIFACT_TYPES = [
  'verification_request',
  'determination_worksheet',
  'notice',
] as const;
