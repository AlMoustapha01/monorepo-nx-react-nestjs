import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { lingui } from '@lingui/vite-plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/libs/web/storefront',
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    react(),
    babel({
      plugins: ['@lingui/babel-plugin-lingui-macro'],
      presets: [reactCompilerPreset()],
    }),
    lingui({ cwd: import.meta.dirname }),
  ],
  test: {
    name: 'web-storefront',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/libs/web/storefront',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/libs/web/storefront',
      provider: 'v8' as const,
    },
  },
}));
