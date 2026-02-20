import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const cases = pgTable('cases', {
  id: uuid('id').primaryKey().defaultRandom(),
  program: text('program').notNull().default('SNAP'),
  jurisdiction: text('jurisdiction'),
  status: text('status').notNull().default('RECEIVED'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
