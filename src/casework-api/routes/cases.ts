import { Router } from 'express';
import { db } from '@db/connection';
import { cases } from '@db/schema/cases';
import { events } from '@db/schema/events';
import { eq, desc } from 'drizzle-orm';
import { broadcast } from '../websocket';
import { WS_EVENTS } from '@shared/constants';

const router = Router();

// List all cases
router.get('/cases', async (_req, res) => {
  const rows = await db.select().from(cases).orderBy(desc(cases.createdAt));
  res.json({ success: true, data: rows });
});

// Get case with events
router.get('/cases/:id', async (req, res) => {
  const [row] = await db.select().from(cases).where(eq(cases.id, req.params.id));
  if (!row) return res.status(404).json({ success: false, error: 'Case not found' });
  const caseEvents = await db.select().from(events).where(eq(events.caseId, row.id)).orderBy(events.createdAt);
  res.json({ success: true, data: { ...row, events: caseEvents } });
});

// Get events for a case
router.get('/cases/:id/events', async (req, res) => {
  const rows = await db.select().from(events).where(eq(events.caseId, req.params.id)).orderBy(events.createdAt);
  res.json({ success: true, data: rows });
});

// Create a case (auto-logs CASE_CREATED event)
router.post('/cases', async (_req, res) => {
  const [newCase] = await db.insert(cases).values({}).returning();
  const [event] = await db.insert(events).values({
    caseId: newCase.id,
    actor: 'system',
    action: 'CASE_CREATED',
    payload: { program: newCase.program, status: newCase.status },
  }).returning();
  broadcast(WS_EVENTS.EVENT_CREATED, event);
  res.status(201).json({ success: true, data: { case: newCase, event } });
});

// Log an event on a case
router.post('/cases/:id/events', async (req, res) => {
  const { actor, action, payload } = req.body;
  if (!actor || !action) return res.status(400).json({ success: false, error: 'actor and action required' });
  const [row] = await db.select().from(cases).where(eq(cases.id, req.params.id));
  if (!row) return res.status(404).json({ success: false, error: 'Case not found' });
  const [event] = await db.insert(events).values({
    caseId: req.params.id,
    actor,
    action,
    payload: payload ?? null,
  }).returning();
  broadcast(WS_EVENTS.EVENT_CREATED, event);
  res.status(201).json({ success: true, data: event });
});

export default router;
