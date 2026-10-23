/**
 * Création d'une lib feature front vide mais câblée sous libs/web/<nom> : config Nx, TypeScript,
 * Vitest (macro Lingui, jsdom, passWithNoTests), oxlint web, outils de test. Aucun composant :
 * ils s'écrivent ensuite, en TDD. Logique pure ; les fichiers sont dans new-web-feature.mts.
 * Nom, scope et alias : voir new-domain-core.mts.
 */
import { json } from './new-domain-core.mts';

/** Fichiers de la lib, par chemin depuis la racine du repo. */
export function webFeatureFiles(name: string, scope: string): Record<string, string> {
  const root = `libs/web/${name}`;
  const project = `web-${name}`;
  return {
    [`${root}/project.json`]: json({
      name: project,
      $schema: '../../../node_modules/nx/schemas/project-schema.json',
      sourceRoot: `${root}/src`,
      projectType: 'library',
      tags: ['scope:web', 'type:feature'],
      targets: {
        typecheck: {
          executor: 'nx:run-commands',
          cache: true,
          inputs: ['default', '^default'],
          options: {
            cwd: '{projectRoot}',
            commands: ['tsc --noEmit -p tsconfig.lib.json', 'tsc --noEmit -p tsconfig.spec.json'],
            parallel: false,
          },
        },
      },
    }),
    [`${root}/.oxlintrc.json`]: json({ extends: ['../.oxlintrc.web.json'] }),
    [`${root}/lingui.config.ts`]: `import { defineConfig } from '@lingui/cli';

// Config minimale pour la macro Lingui des tests ; le catalogue vit dans apps/web.
export default defineConfig({
  sourceLocale: 'fr',
  locales: ['fr', 'en'],
});
`,
    [`${root}/tsconfig.json`]: json({
      extends: '../../../tsconfig.base.json',
      compilerOptions: {
        jsx: 'react-jsx',
        module: 'esnext',
        forceConsistentCasingInFileNames: true,
        strict: true,
        noUncheckedIndexedAccess: true,
        importHelpers: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        noFallthroughCasesInSwitch: true,
        noPropertyAccessFromIndexSignature: true,
      },
      files: [],
      include: [],
      references: [{ path: './tsconfig.lib.json' }, { path: './tsconfig.spec.json' }],
    }),
    [`${root}/tsconfig.lib.json`]: json({
      extends: './tsconfig.json',
      compilerOptions: {
        outDir: '../../../dist/out-tsc',
        declaration: true,
        types: ['vite/client'],
      },
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        'vitest.config.mts',
        'src/test-setup.ts',
        'src/test-utils.tsx',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.tsx',
      ],
    }),
    [`${root}/tsconfig.spec.json`]: json({
      extends: './tsconfig.json',
      compilerOptions: {
        outDir: '../../../dist/out-tsc',
        types: ['vitest/globals', 'vitest/importMeta', 'vite/client', 'node', 'vitest'],
      },
      include: [
        'vitest.config.mts',
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.test.tsx',
        'src/**/*.spec.tsx',
        'src/**/*.d.ts',
        'src/test-setup.ts',
        'src/test-utils.tsx',
      ],
    }),
    [`${root}/vitest.config.mts`]: `import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import { lingui } from '@lingui/vite-plugin';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/${root}',
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
    name: '${project}',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/${root}',
    watch: false,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['{src,tests}/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: '../../../coverage/${root}',
      provider: 'v8' as const,
    },
  },
}));
`,
    [`${root}/src/index.ts`]: `// Façade de la feature ${name} : seul point d'entrée public (exports nommés, jamais export *).
// Composants d'écran, fabriques de requêtes et hooks utiles à apps/web s'exportent ici.
export {};
`,
    [`${root}/src/test-setup.ts`]: `import '@testing-library/jest-dom/vitest';
`,
    [`${root}/src/test-utils.tsx`]: `import type { ReactNode } from 'react';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createQueryClient } from '${scope}/web-data-access';

export interface RenderOptions {
  /** Chemin où \`ui\` est rendu (défaut \`/\`). */
  path?: string;
  /** Routes factices, qui affichent leur chemin : permettent de vérifier une navigation. */
  routes?: string[];
}

/** Rend \`ui\` dans i18n (fr, catalogue vide : les messages source s'affichent), React Query et un routeur mémoire. */
export async function renderWithProviders(ui: ReactNode, options: RenderOptions = {}) {
  const { path = '/', routes = [] } = options;
  const i18n = setupI18n();
  i18n.loadAndActivate({ locale: 'fr', messages: {} });
  const queryClient = createQueryClient();

  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path, component: () => ui });
  const stubs = routes
    .filter((route) => route !== path)
    .map((route) =>
      createRoute({ getParentRoute: () => root, path: route, component: () => <p>{route}</p> }),
    );
  const router = createRouter({
    routeTree: root.addChildren([page, ...stubs]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();

  const result = render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
  return { ...result, queryClient, router };
}
`,
  };
}
