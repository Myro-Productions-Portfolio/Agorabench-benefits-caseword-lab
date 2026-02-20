import { pgTable, uuid, text, timestamp, jsonb } from 'drizzle-orm/pg-core';
import { cases } from './cases';
import { events } from './events';

export const artifacts = pgTable('artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  eventId: uuid('event_id').notNull().references(() => events.id),
  type: text('type').notNull(),
  content: jsonb('content').notNull(),
  citations: text('citations').array().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
