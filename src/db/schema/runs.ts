import { pgTable, uuid, text, integer, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { cases } from './cases';

export const runs = pgTable('runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  scenario: text('scenario').notNull(),
  seed: integer('seed').notNull(),
  count: integer('count').notNull(),
  summary: jsonb('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const runCases = pgTable('run_cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  caseId: uuid('case_id').notNull().references(() => cases.id),
  variant: text('variant').notNull(),
  outcome: text('outcome').notNull(),
  finalState: text('final_state').notNull(),
  slaBreaches: text('sla_breaches').array(),
  timeToDecisionDays: integer('time_to_decision_days'),
});
