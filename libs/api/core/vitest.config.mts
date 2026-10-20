import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/api/core',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'api-core',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/libs/api/core',
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
      reportsDirectory: '../../../coverage/libs/api/core',
      provider: 'v8' as const,
    },
  },
}));
