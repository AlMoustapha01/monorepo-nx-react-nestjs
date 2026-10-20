import { defineConfig } from 'drizzle-kit';

// Chaque domaine déclare ses tables dans libs/api/<domaine>/src/lib/infra/*.schema.ts ;
// api-core y ajoute l'infrastructure transverse (outbox).
export default defineConfig({
  dialect: 'postgresql',
  schema: ['./libs/api/*/src/lib/infra/*.schema.ts', './libs/api/core/src/lib/**/*.schema.ts'],
  out: './apps/api/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
  strict: true,
});
