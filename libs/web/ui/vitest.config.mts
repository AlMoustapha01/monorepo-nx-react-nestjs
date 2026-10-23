import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/web/ui',
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [react(), babel({ presets: [reactCompilerPreset()] })],
  test: {
    name: 'web-ui',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/libs/web/ui',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/web/ui',
      provider: 'v8' as const,
    },
  },
}));
