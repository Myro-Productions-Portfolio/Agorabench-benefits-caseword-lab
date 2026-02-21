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
  'APPEAL_HEARING_SCHEDULED',
  'APPEAL_DECIDED',
  'IMPLEMENTED',
  'CLOSED',
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
  'HEARING_SCHEDULED',
  'APPEAL_IMPLEMENTED',
] as const;

export const ARTIFACT_TYPES = [
  'verification_request',
  'determination_worksheet',
  'notice',
  'appeal_request',
  'hearing_record',
  'appeal_decision',
] as const;

export const CASE_ACTIONS = [
  'create_case',
  'request_verification',
  'receive_verification',
  'verification_complete',
  'verification_refused',
  'approve',
  'deny',
  'send_notice',
  'implement',
  'close_case',
  'close_abandoned',
  'appeal_filed',
  'schedule_hearing',
  'render_decision',
  'implement_favorable',
  'implement_unfavorable',
  'reopen_case',
] as const;

export const ROLES = [
  'intake_clerk',
  'caseworker',
  'supervisor',
  'hearing_officer',
  'system',
] as const;

export const SCENARIOS = ['missing_docs', 'appeal_reversal'] as const;
