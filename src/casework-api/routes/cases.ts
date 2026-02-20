import { Router } from 'express';
import { db } from '@db/connection';
import { cases } from '@db/schema/cases';
import { events } from '@db/schema/events';
import { artifacts } from '@db/schema/artifacts';
import { eq, desc } from 'drizzle-orm';
import { broadcast } from '../websocket';
import { WS_EVENTS } from '@shared/constants';
import { validateCitations } from '@core/citations';
import { validateArtifact } from '@core/artifacts';
import type { PolicyPack } from '@core/policy-pack';

const router = Router();

// List all cases
router.get('/cases', async (_req, res) => {
  const rows = await db.select().from(cases).orderBy(desc(cases.createdAt));
  res.json({ success: true, data: rows });
});

// Get case with events
router.get('/cases/:id', async (req, res) => {
  const [row] = await db
    .select()
    .from(cases)
    .where(eq(cases.id, req.params.id));
  if (!row)
    return res
      .status(404)
      .json({ success: false, error: 'Case not found' });
  const caseEvents = await db
    .select()
    .from(events)
    .where(eq(events.caseId, row.id))
    .orderBy(events.createdAt);
  res.json({ success: true, data: { ...row, events: caseEvents } });
});

// Get events for a case
router.get('/cases/:id/events', async (req, res) => {
  const rows = await db
    .select()
    .from(events)
    .where(eq(events.caseId, req.params.id))
    .orderBy(events.createdAt);
  res.json({ success: true, data: rows });
});

// Get artifacts for a case
router.get('/cases/:id/artifacts', async (req, res) => {
  const rows = await db
    .select()
    .from(artifacts)
    .where(eq(artifacts.caseId, req.params.id))
    .orderBy(desc(artifacts.createdAt));
  res.json({ success: true, data: rows });
});

// Create a case (auto-logs CASE_CREATED event)
router.post('/cases', async (req, res) => {
  const { citations } = req.body as { citations?: string[] };

  if (!citations || !Array.isArray(citations)) {
    return res
      .status(400)
      .json({ success: false, error: 'citations array is required' });
  }

  const policyPack = req.app.locals.policyPack as PolicyPack;
  const citationResult = validateCitations(citations, policyPack.ruleIndex);
  if (!citationResult.valid) {
    return res
      .status(400)
      .json({ success: false, error: citationResult.error });
  }

  const [newCase] = await db.insert(cases).values({}).returning();
  const [event] = await db
    .insert(events)
    .values({
      caseId: newCase.id,
      actor: 'system',
      action: 'CASE_CREATED',
      payload: { program: newCase.program, status: newCase.status },
      citations,
    })
    .returning();
  broadcast(WS_EVENTS.EVENT_CREATED, event);
  res.status(201).json({ success: true, data: { case: newCase, event } });
});

// Log an event on a case (with citation enforcement + optional artifact)
router.post('/cases/:id/events', async (req, res) => {
  const { actor, action, payload, citations, artifact } = req.body as {
    actor?: string;
    action?: string;
    payload?: Record<string, unknown>;
    citations?: string[];
    artifact?: { type: string; content: unknown };
  };

  if (!actor || !action)
    return res
      .status(400)
      .json({ success: false, error: 'actor and action required' });

  if (!citations || !Array.isArray(citations)) {
    return res
      .status(400)
      .json({ success: false, error: 'citations array is required' });
  }

  const policyPack = req.app.locals.policyPack as PolicyPack;
  const citationResult = validateCitations(citations, policyPack.ruleIndex);
  if (!citationResult.valid) {
    return res
      .status(400)
      .json({ success: false, error: citationResult.error });
  }

  const [row] = await db
    .select()
    .from(cases)
    .where(eq(cases.id, req.params.id));
  if (!row)
    return res
      .status(404)
      .json({ success: false, error: 'Case not found' });

  // Validate artifact if provided
  if (artifact) {
    const artifactResult = validateArtifact(artifact.type, artifact.content);
    if (!artifactResult.success) {
      return res
        .status(400)
        .json({ success: false, error: artifactResult.error });
    }
  }

  // Insert event first (without artifactId)
  const [event] = await db
    .insert(events)
    .values({
      caseId: req.params.id,
      actor,
      action,
      payload: payload ?? null,
      citations,
    })
    .returning();

  let createdArtifact = null;

  // If artifact provided, create it linked to event, then update event
  if (artifact) {
    const [newArtifact] = await db
      .insert(artifacts)
      .values({
        caseId: req.params.id,
        eventId: event.id,
        type: artifact.type,
        content: artifact.content,
        citations,
      })
      .returning();

    await db
      .update(events)
      .set({ artifactId: newArtifact.id })
      .where(eq(events.id, event.id));

    event.artifactId = newArtifact.id;
    createdArtifact = newArtifact;
  }

  broadcast(WS_EVENTS.EVENT_CREATED, {
    event,
    artifact: createdArtifact,
  });

  res
    .status(201)
    .json({ success: true, data: { event, artifact: createdArtifact } });
});

export default router;
