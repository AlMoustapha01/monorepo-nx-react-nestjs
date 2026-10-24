/// <reference types='vitest' />
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { lingui } from '@lingui/vite-plugin';
import { tanstackRouter } from '@tanstack/router-plugin/vite';

export default defineConfig(() => ({
  root: import.meta.dirname,
  // apps/web/.env (variables VITE_*) : le .env de la racine sert à l'API et au service d'auth.
  envDir: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4300,
    host: 'localhost',
  },
  plugins: [
    tailwindcss(),
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    babel({
      plugins: ['@lingui/babel-plugin-lingui-macro'],
      presets: [reactCompilerPreset()],
    }),
    lingui({ cwd: import.meta.dirname }),
  ],
  // Uncomment this if you are using workers.
  // worker: {
  //    plugins: () => [ tsconfigPaths() ],
  // },
  build: {
    outDir: '../../dist/apps/web',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rolldownOptions: {
      treeshake: {
        // Nos libs n'ont pas d'effet de bord à l'import (équivalent de `"sideEffects": false`).
        // Sans cela, importer une façade (`index.ts`) depuis le code de démarrage rend tous ses
        // modules « atteignables » au démarrage : le bundler les place dans un chunk initial au
        // lieu des chunks des routes chargées à la demande.
        moduleSideEffects: (id: string) =>
          /\/libs\/(web|shared)\/[^/]+\/src\/.*\.tsx?$/.test(id) ? false : undefined,
      },
    },
  },
  test: {
    name: 'web',
    fsModuleCachePath: '../../node_modules/.vitest-cache/apps/web',
    watch: false,
    globals: true,
    environment: 'jsdom',
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../coverage/apps/web',
      provider: 'v8' as const,
    },
  },
}));
