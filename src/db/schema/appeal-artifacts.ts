import { pgTable, uuid, text, jsonb, timestamp } from 'drizzle-orm/pg-core';
import { runs } from './runs';

export const appealArtifacts = pgTable('appeal_artifacts', {
  id: uuid('id').primaryKey().defaultRandom(),
  runId: uuid('run_id').notNull().references(() => runs.id),
  runnerCaseId: text('runner_case_id').notNull(),
  artifactType: text('artifact_type').notNull(),
  data: jsonb('data').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
