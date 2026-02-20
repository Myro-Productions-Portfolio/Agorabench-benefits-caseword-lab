import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgresql://casework:casework_dev_2026@localhost:5436/benefits_casework',
  },
  verbose: true,
  strict: true,
});
