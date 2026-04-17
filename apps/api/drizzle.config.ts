import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/seotracker',
  },
  dialect: 'postgresql',
  out: './drizzle',
  schema: '../../packages/server/src/database/schema.ts',
  strict: true,
  verbose: true,
});
