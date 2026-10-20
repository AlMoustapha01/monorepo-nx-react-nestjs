import { defineConfig } from 'drizzle-kit';

// Chaque domaine déclare ses tables dans libs/api/<domaine>/src/lib/infra/*.schema.ts.
export default defineConfig({
  dialect: 'postgresql',
  schema: './libs/api/*/src/lib/infra/*.schema.ts',
  out: './apps/api/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
});
