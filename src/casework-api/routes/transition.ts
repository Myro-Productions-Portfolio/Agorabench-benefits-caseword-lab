import { Router } from 'express';
import { db } from '@db/connection';
import { cases } from '@db/schema/cases';
import { events } from '@db/schema/events';
import { eq } from 'drizzle-orm';
import { transition as applyTransition } from '@core/state-machine';
import type { CaseData, CaseStatus, CaseAction, Role } from '@core/state-machine';
import { validateCitations } from '@core/citations';
import type { PolicyPack } from '@core/policy-pack';
import { broadcast } from '../websocket';
import { WS_EVENTS } from '@shared/constants';

const router = Router();

router.post('/cases/:id/transition', async (req, res) => {
  const { action, actor, role, citations, metadata } = req.body as {
    action?: string;
    actor?: string;
    role?: string;
    citations?: string[];
    metadata?: Partial<CaseData>;
  };

  // --- Validate required fields ---
  if (!action || !actor || !role) {
    return res
      .status(400)
      .json({ success: false, error: 'action, actor, and role are required' });
  }

  if (!citations || !Array.isArray(citations)) {
    return res
      .status(400)
      .json({ success: false, error: 'citations array is required' });
  }

  // --- Validate citations against policy pack ruleIndex ---
  const policyPack = req.app.locals.policyPack as PolicyPack;
  const citationResult = validateCitations(citations, policyPack.ruleIndex);
  if (!citationResult.valid) {
    return res
      .status(400)
      .json({ success: false, error: citationResult.error });
  }

  // --- Load case from DB ---
  const [row] = await db
    .select()
    .from(cases)
    .where(eq(cases.id, req.params.id));

  if (!row) {
    return res
      .status(404)
      .json({ success: false, error: 'Case not found' });
  }

  // --- Build transition context ---
  const caseData: CaseData = metadata
    ? {
        applicantName: metadata.applicantName ?? 'Unknown',
        householdSize: metadata.householdSize ?? 1,
        requiredVerifications: metadata.requiredVerifications ?? [],
        verifiedItems: metadata.verifiedItems ?? [],
        missingItems: metadata.missingItems ?? [],
        applicationFiledAt: metadata.applicationFiledAt
          ? new Date(metadata.applicationFiledAt)
          : new Date(row.createdAt),
        verificationRequestedAt: metadata.verificationRequestedAt
          ? new Date(metadata.verificationRequestedAt)
          : undefined,
        determinationResult: metadata.determinationResult,
      }
    : {
        applicantName: 'Unknown',
        householdSize: 1,
        requiredVerifications: [],
        verifiedItems: [],
        missingItems: [],
        applicationFiledAt: new Date(row.createdAt),
      };

  const ctx = {
    caseId: row.id,
    currentState: row.status as CaseStatus,
    actor: { role: role as Role, agentId: actor },
    timestamp: new Date(),
    caseData,
    policyPack: {
      sla: policyPack.sla,
      ruleIndex: policyPack.ruleIndex,
    },
  };

  // --- Apply transition ---
  const result = applyTransition(row.status as CaseStatus, action as CaseAction, ctx);

  if (!result.ok) {
    return res.status(400).json({
      success: false,
      error: result.error,
      guardResults: result.guardResults,
    });
  }

  // --- On success: update case status, insert event, broadcast ---
  const fromState = row.status;
  const toState = result.newState;

  await db
    .update(cases)
    .set({ status: toState, updatedAt: new Date() })
    .where(eq(cases.id, row.id));

  const [event] = await db
    .insert(events)
    .values({
      caseId: row.id,
      actor,
      action: 'STATUS_CHANGED',
      payload: { fromState, toState, action },
      citations,
    })
    .returning();

  broadcast(WS_EVENTS.EVENT_CREATED, {
    event,
    transition: { fromState, toState, action },
  });

  res.json({
    success: true,
    data: {
      fromState,
      toState,
      event,
      guardResults: result.guardResults,
    },
  });
});

export default router;
