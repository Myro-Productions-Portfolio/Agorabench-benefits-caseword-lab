import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { runs } from './runs';

export const qaMismatches = pgTable('qa_mismatches', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  runnerCaseId: text('runner_case_id').notNull(),
  mismatchType: text('mismatch_type').notNull(),
  severity: text('severity').notNull(),
  runnerValue: text('runner_value').notNull(),
  oracleValue: text('oracle_value').notNull(),
  detail: jsonb('detail'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
