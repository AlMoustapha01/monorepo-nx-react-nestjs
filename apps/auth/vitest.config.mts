import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/auth',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'auth',
    fsModuleCachePath: '../../node_modules/.vitest-cache/apps/auth',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    // Les tests e2e démarrent un Postgres via Testcontainers.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/auth',
      provider: 'v8' as const,
    },
  },
}));
