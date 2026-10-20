import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/api/catalog',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-catalog',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/libs/api/catalog',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    // Les tests d'intégration démarrent un Postgres via Testcontainers.
    hookTimeout: 120_000,
    testTimeout: 30_000,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/api/catalog',
      provider: 'v8' as const,
    },
  },
}));
