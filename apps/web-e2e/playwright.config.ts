import { defineConfig, devices } from '@playwright/test';

import { E2E_PORTS } from './src/stack';

/**
 * Parcours navigateur contre la vraie stack : Postgres, Redis et Mailpit (Testcontainers), service
 * d'auth, API (JWKS) et front construit. `src/global-setup.ts` démarre tout, une fois par exécution.
 */
export default defineConfig({
  testDir: './src',
  globalSetup: './src/global-setup.ts',
  // Démarrage de la stack compris : conteneurs, migrations, build du front.
  globalTimeout: 15 * 60_000,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI']
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: '../../dist/.playwright/apps/web-e2e/report' }],
      ]
    : 'list',
  outputDir: '../../dist/.playwright/apps/web-e2e/results',
  use: {
    baseURL: `http://localhost:${E2E_PORTS.web}`,
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
