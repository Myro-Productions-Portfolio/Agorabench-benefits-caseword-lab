import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const events = pgTable('events', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  actor: text('actor').notNull(),
  action: text('action').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
