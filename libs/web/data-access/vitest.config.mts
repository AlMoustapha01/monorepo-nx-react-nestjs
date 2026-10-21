import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/web/data-access',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: 'web-data-access',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/libs/web/data-access',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/web/data-access',
      provider: 'v8' as const,
    },
  },
}));
