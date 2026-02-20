# Workflow State Machine Specification

This document defines the case workflow state machine: states, transitions, guards, role permissions, failure paths, and deadline enforcement.

---

## 1. States

| State | Description | Entry Condition |
|-------|-------------|-----------------|
| `RECEIVED` | Application filed, initial screening pending | Case created |
| `EXPEDITED_SCREENING` | Checking expedited processing criteria | Application flagged for expedited check |
| `PENDING_VERIFICATION` | Waiting for applicant to provide required documents | Verification request sent |
| `READY_FOR_DETERMINATION` | All mandatory verification received, awaiting caseworker decision | Verification complete |
| `DETERMINED_APPROVED` | Eligibility confirmed, benefit amount calculated | Caseworker approves |
| `DETERMINED_DENIED` | Eligibility denied with specific reason and cited rules | Caseworker denies |
| `NOTICE_SENT` | Formal notice (approval, denial, or adverse action) mailed/delivered | Notice generated and dispatched |
| `APPEAL_REQUESTED` | Applicant has requested a fair hearing | Appeal filed within 90-day window |
| `APPEAL_HEARING_SCHEDULED` | Hearing date set, advance notice sent | Hearing scheduled |
| `APPEAL_DECIDED` | Hearing officer has issued a decision | Decision rendered |
| `IMPLEMENTED` | Final action taken (benefits issued, denial finalized, or appeal outcome applied) | Implementation complete |
| `CLOSED` | Case closed after implementation or abandonment | Terminal state reached |

### Terminal States

- `CLOSED` is the only terminal state. All other states can transition forward.
- A case reaches `CLOSED` from `IMPLEMENTED` after benefits are issued or denial is finalized, or from `PENDING_VERIFICATION` if the applicant abandons (60+ days with no response after denial for missing verification).

---

## 2. Transitions

```
RECEIVED
  ├─[screen_expedited]──► EXPEDITED_SCREENING
  └─[request_verification]──► PENDING_VERIFICATION

EXPEDITED_SCREENING
  ├─[qualifies_expedited: request_verification]──► PENDING_VERIFICATION (7-day SLA)
  └─[not_expedited: request_verification]──► PENDING_VERIFICATION (30-day SLA)

PENDING_VERIFICATION
  ├─[verification_complete]──► READY_FOR_DETERMINATION
  ├─[verification_partial + deadline_passed + failure]──► DETERMINED_DENIED (pend if <10 days given)
  ├─[verification_refused]──► DETERMINED_DENIED
  └─[post_denial_recovery]──► READY_FOR_DETERMINATION (if docs arrive within 60 days)

READY_FOR_DETERMINATION
  ├─[approve]──► DETERMINED_APPROVED
  └─[deny]──► DETERMINED_DENIED

DETERMINED_APPROVED
  └─[send_notice]──► NOTICE_SENT

DETERMINED_DENIED
  └─[send_notice]──► NOTICE_SENT

NOTICE_SENT
  ├─[appeal_filed]──► APPEAL_REQUESTED
  ├─[no_appeal + appeal_window_expired]──► IMPLEMENTED
  └─[adverse_action + continued_benefits_requested]──► APPEAL_REQUESTED (benefits continue)

APPEAL_REQUESTED
  └─[schedule_hearing]──► APPEAL_HEARING_SCHEDULED

APPEAL_HEARING_SCHEDULED
  └─[render_decision]──► APPEAL_DECIDED

APPEAL_DECIDED
  ├─[decision_favorable: implement_increase]──► IMPLEMENTED (within 10 days)
  ├─[decision_unfavorable: implement_decrease]──► IMPLEMENTED (next issuance)
  └─[decision_remand: reopen_case]──► READY_FOR_DETERMINATION

IMPLEMENTED
  └─[close_case]──► CLOSED
```

---

## 3. Transition Guards

Guards are boolean conditions that must be satisfied before a transition fires. If a guard fails, the transition is blocked and an event is logged.

| Transition | Guard | Failure Behavior |
|-----------|-------|-----------------|
| `request_verification` | Verification request notice includes all required fields (NOT-VER-001) | Block; log `GUARD_FAIL_NOTICE_INCOMPLETE` |
| `verification_complete` | All mandatory items (VER-MAND-001) have status `verified` | Block; log `GUARD_FAIL_VERIFICATION_INCOMPLETE` |
| `approve` | Oracle check passes (eligibility + benefit match) OR supervisor override attached | Block; log `GUARD_FAIL_ORACLE_MISMATCH` |
| `deny` | Denial reason cites at least one `ruleId`; denial notice includes all required fields (NOT-DENY-001) | Block; log `GUARD_FAIL_MISSING_CITATION` |
| `send_notice` | Notice contains all required fields per notice type (NOT-APPR-001, NOT-DENY-001, NOT-ADV-001) | Block; log `GUARD_FAIL_NOTICE_INCOMPLETE` |
| `appeal_filed` | Filed within 90 calendar days of adverse action date (SLA-APP-001) | Block; log `GUARD_FAIL_APPEAL_DEADLINE_EXPIRED` |
| `schedule_hearing` | Hearing date is at least 10 days after notice date (SLA-APP-002) | Block; log `GUARD_FAIL_HEARING_NOTICE_TOO_SHORT` |
| `render_decision` | Decision cites hearing record, summarizes facts, specifies reasons, cites regulations | Block; log `GUARD_FAIL_DECISION_INCOMPLETE` |
| `implement_increase` | Implementation occurs within 10 calendar days of decision (SLA-APP-004) | Allowed but scored as SLA breach |
| `verification_partial + deny` | Applicant was given minimum 10 days to respond (SLA-VER-001) AND failure-vs-refusal distinction applied | Block; log `GUARD_FAIL_PREMATURE_DENIAL` |

---

## 4. Role Permissions

Each action is restricted to specific roles. Attempting an unauthorized action produces a `ROLE_VIOLATION` event and is blocked.

### Intake Clerk

| Action | Description |
|--------|-------------|
| `create_case` | File a new application, set initial data |
| `screen_expedited` | Check if expedited criteria apply |
| `request_verification` | Send verification request notice with specific missing items |
| `receive_verification` | Log receipt of documents, update verification status |
| `route_to_caseworker` | Assign case to caseworker queue |

**Cannot:** Make eligibility determinations, approve/deny, generate determination notices, handle appeals.

### Caseworker

| Action | Description |
|--------|-------------|
| `run_eligibility_check` | Execute oracle against case data |
| `approve` | Approve application with benefit calculation |
| `deny` | Deny application with cited reason |
| `send_notice` | Generate and dispatch formal notice |
| `request_additional_verification` | Ask for conditional verification items |
| `escalate_to_supervisor` | Flag case for supervisor review |

**Cannot:** Create cases, override oracle without supervisor approval, decide appeals.

### Supervisor / QA

| Action | Description |
|--------|-------------|
| `approve_override` | Approve a determination that conflicts with oracle (with documented justification) |
| `audit_case` | Review case for quality, flag issues |
| `schedule_hearing` | Set appeal hearing date |
| `render_decision` | Issue appeal decision |
| `implement_decision` | Apply appeal outcome (increase/decrease/remand) |
| `close_case` | Finalize and close case |

**Cannot:** Create cases (unless also acting as intake).

### System (Automated)

| Action | Description |
|--------|-------------|
| `enforce_deadline` | Fire SLA breach event when deadline passes |
| `close_abandoned` | Close case after 60-day abandonment window |
| `log_event` | Record any state change to immutable audit log |

---

## 5. Deadline Enforcement

Deadlines are loaded from `sla.json` in the active policy pack. The worker service checks deadlines on a configurable tick interval.

| SLA ID | Trigger Event | Deadline | On Breach |
|--------|--------------|----------|-----------|
| SLA-PROC-001 | `APPLICATION_FILED` | 30 calendar days to `DETERMINATION_MADE` | Log `SLA_BREACH_STANDARD_PROCESSING`; full month allotment if agency fault |
| SLA-EXPED-001 | `APPLICATION_FILED` (expedited) | 7 calendar days to `BENEFITS_AVAILABLE` | Log `SLA_BREACH_EXPEDITED`; critical scoring penalty |
| SLA-VER-001 | `VERIFICATION_REQUESTED` | Minimum 10 days before denial allowed | Block denial if <10 days elapsed |
| SLA-NOT-001 | `ADVERSE_ACTION_NOTICE_SENT` | 10 days advance notice before action | Block action if <10 days from notice |
| SLA-APP-001 | `ADVERSE_ACTION_DATE` | 90 days to file appeal | Reject appeal filing after deadline |
| SLA-APP-002 | `HEARING_SCHEDULED` | 10 days notice before hearing | Block hearing if <10 days from notice |
| SLA-APP-003 | `APPEAL_REQUESTED` | 60 days to `APPEAL_DECIDED` | Log `SLA_BREACH_APPEAL_DECISION` |
| SLA-APP-004 | `APPEAL_DECIDED` (favorable) | 10 days to implement benefit increase | Log `SLA_BREACH_IMPLEMENTATION` |

### Deadline Calculation

```
deadline_date = trigger_event.timestamp + sla.maxCalendarDays (calendar days)
is_breached = current_date > deadline_date AND end_event has not occurred
```

For minimum-day SLAs (like verification response), the check is inverted:

```
earliest_allowed_date = trigger_event.timestamp + sla.minCalendarDays
action_blocked = current_date < earliest_allowed_date
```

---

## 6. Failure Paths

### 6.1 Verification Failure (Most Common)

```
PENDING_VERIFICATION
  │
  ├─ Applicant provides all docs ──► READY_FOR_DETERMINATION (happy path)
  │
  ├─ 10-day deadline passes, applicant FAILED to provide (tried but couldn't)
  │   └─ Case PENDED (not denied). Agency must assist. Clock continues.
  │       ├─ Docs arrive within 30 days of filing ──► READY_FOR_DETERMINATION
  │       │   (benefits from application date)
  │       ├─ Docs arrive days 31-60 ──► READY_FOR_DETERMINATION
  │       │   (benefits from date docs furnished)
  │       └─ No docs after 60 days ──► CLOSED (new application required)
  │
  └─ Applicant explicitly REFUSES to provide
      └─ DETERMINED_DENIED immediately (no pend period)
```

### 6.2 Oracle Mismatch

```
READY_FOR_DETERMINATION
  │
  ├─ Caseworker runs oracle ──► result matches caseworker judgment ──► proceed
  │
  └─ Oracle disagrees with caseworker
      ├─ Caseworker adjusts to match oracle ──► proceed
      └─ Caseworker believes oracle is wrong
          └─ escalate_to_supervisor
              ├─ Supervisor approves override (documented justification) ──► proceed
              └─ Supervisor rejects override ──► caseworker must follow oracle
```

### 6.3 Appeal Reversal

```
NOTICE_SENT (denial or adverse action)
  │
  └─ appeal_filed (within 90 days)
      └─ APPEAL_REQUESTED
          │
          ├─ If filed within advance notice period AND not waived:
          │   └─ Benefits continue at pre-action level
          │
          └─ APPEAL_HEARING_SCHEDULED
              └─ APPEAL_DECIDED
                  ├─ Favorable (agency was wrong)
                  │   └─ IMPLEMENTED within 10 days
                  │       └─ Lost benefits restored
                  │
                  ├─ Unfavorable (agency upheld)
                  │   └─ IMPLEMENTED at next issuance
                  │       └─ Overpayment claim if continued benefits were issued
                  │
                  └─ Remand (need more facts)
                      └─ READY_FOR_DETERMINATION (case reopened)
```

### 6.4 Agency-Caused Delay

```
APPLICATION_FILED ──► 30 days pass without determination
  │
  └─ Is delay agency's fault?
      ├─ YES: Full month allotment (no proration), back benefits owed
      └─ NO (applicant-caused): Standard processing continues
```

---

## 7. Event Schema

Every state transition produces an immutable event record:

```typescript
interface CaseEvent {
  eventId: string;          // UUID
  caseId: string;           // FK to case
  timestamp: string;        // ISO 8601
  actor: {
    role: 'intake_clerk' | 'caseworker' | 'supervisor' | 'system';
    agentId: string;        // Which agent/user performed the action
  };
  action: string;           // e.g., 'approve', 'deny', 'request_verification'
  fromState: CaseState;
  toState: CaseState;
  guardResults: {           // Which guards were checked and their results
    guardName: string;
    passed: boolean;
    detail?: string;
  }[];
  citations: string[];      // ruleIds cited for this action
  artifactRefs: string[];   // IDs of artifacts produced or consumed
  metadata: Record<string, unknown>; // Action-specific data
}
```

---

## 8. State Machine Implementation Notes

### Reducer Pattern

The state machine is implemented as a pure reducer in `casework-core/`:

```typescript
function transition(currentState: CaseState, action: CaseAction): TransitionResult {
  // 1. Check role permission
  // 2. Evaluate guards
  // 3. If all pass, return new state + event
  // 4. If any fail, return error + blocked event
}
```

This keeps the state machine deterministic, testable, and independent of infrastructure (no database, no network calls). The API and worker layers call the reducer and persist the results.

### Guard Composition

Guards are composable functions:

```typescript
type Guard = (caseData: CaseSnapshot, action: CaseAction, policyPack: PolicyPack) => GuardResult;
```

Each transition has an ordered list of guards. All must pass for the transition to proceed. Guard failures are always logged with the specific guard name and failure reason.
