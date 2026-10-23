/**
 * Création d'un domaine API vide mais câblé : lib Nx sous libs/api/<nom>, alias vers sa façade,
 * module enregistré dans l'AppModule. Aucun code métier : il s'écrit ensuite, en TDD.
 * Logique pure ; les fichiers sont dans new-domain.mts.
 */

const LIB_NAME = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const RESERVED = new Set(['core']);

/** Nom de lib utilisable comme dossier, nom de projet Nx et alias ; sinon, ce qui ne va pas. */
export function libNameProblem(name: string): string | undefined {
  if (!LIB_NAME.test(name)) {
    return `« ${name} » : minuscules, chiffres et tirets simples, commençant par une lettre (ex. billing, loyalty-points).`;
  }
  return undefined;
}

export function domainNameProblem(name: string): string | undefined {
  const problem = libNameProblem(name);
  if (problem) {
    return problem;
  }
  if (RESERVED.has(name)) {
    return `« ${name} » est réservé (libs/api/${name} existe déjà dans le boilerplate).`;
  }
  return undefined;
}

export function moduleClassName(name: string): string {
  const pascal = name
    .split('-')
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join('');
  return `${pascal}Module`;
}

export const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

/** Scope npm du projet (`@acme`), lu dans l'alias de api-core : init:project a pu le renommer. */
export function scopeOf(tsconfigBase: string): string {
  const paths: Record<string, string[]> = JSON.parse(tsconfigBase).compilerOptions?.paths ?? {};
  const alias = Object.keys(paths).find((key) => /^@[^/]+\/api-core$/.test(key));
  if (!alias) {
    throw new Error(
      'Alias de api-core introuvable dans tsconfig.base.json (compilerOptions.paths).',
    );
  }
  return alias.slice(0, alias.indexOf('/'));
}

/** Fichiers de la lib, par chemin depuis la racine du repo. */
export function domainFiles(name: string): Record<string, string> {
  const root = `libs/api/${name}`;
  const project = `api-${name}`;
  const className = moduleClassName(name);
  return {
    [`${root}/project.json`]: json({
      name: project,
      $schema: '../../../node_modules/nx/schemas/project-schema.json',
      sourceRoot: `${root}/src`,
      projectType: 'library',
      tags: ['scope:api', 'type:domain'],
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
    [`${root}/.oxlintrc.json`]: json({
      extends: ['../../../.oxlintrc.json'],
      plugins: ['vitest'],
      overrides: [
        {
          files: ['src/lib/domain/**/*.ts'],
          rules: {
            'no-restricted-imports': [
              'error',
              {
                patterns: [
                  {
                    group: ['@nestjs/*', 'drizzle-orm', 'drizzle-orm/*', 'pg', 'nestjs-*'],
                    message:
                      'domain/ reste du TypeScript pur : pas de framework ni de persistance.',
                  },
                ],
              },
            ],
          },
        },
      ],
    }),
    [`${root}/tsconfig.json`]: json({
      extends: '../../../tsconfig.base.json',
      compilerOptions: {
        module: 'commonjs',
        forceConsistentCasingInFileNames: true,
        strict: true,
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
        declaration: false,
        types: ['node'],
        target: 'es2021',
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        strictNullChecks: true,
        noImplicitAny: true,
        strictBindCallApply: true,
        forceConsistentCasingInFileNames: true,
        noFallthroughCasesInSwitch: true,
      },
      include: ['src/**/*.ts'],
      exclude: ['vitest.config.mts', 'src/**/*.spec.ts', 'src/**/*.test.ts'],
    }),
    [`${root}/tsconfig.spec.json`]: json({
      extends: './tsconfig.json',
      compilerOptions: {
        outDir: '../../../dist/out-tsc',
        types: ['vitest/globals', 'vitest/importMeta', 'vite/client', 'node', 'vitest'],
      },
      include: ['src/**/*.spec.ts', 'src/**/*.test.ts', 'src/**/*.d.ts'],
    }),
    [`${root}/vitest.config.mts`]: `import { defineConfig } from 'vitest/config';

export default defineConfig(() => ({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/${root}',
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    name: '${project}',
    fsModuleCachePath: '../../../node_modules/.vitest-cache/${root}',
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
      reportsDirectory: '../../../coverage/${root}',
      provider: 'v8' as const,
    },
  },
}));
`,
    [`${root}/src/index.ts`]: `// Façade du domaine ${name} : seul point d'entrée autorisé pour le reste du monorepo.
// Pas d'export * : chaque symbole exposé est un engagement envers les autres domaines.
export { ${className} } from './lib/${name}.module';
`,
    [`${root}/src/lib/${name}.module.ts`]: `import { Module } from '@nestjs/common';

// Controllers, cas d'usage, repositories et handlers d'événements se déclarent ici.
@Module({})
export class ${className} {}
`,
  };
}

/**
 * Ajoute l'alias `@scope/<projet>` vers la façade de la lib (`<dossier>/src/index.ts`), après le
 * dernier alias de la même famille (`api-…`, `web-…`).
 */
export function addPathAlias(tsconfigBase: string, project: string, root: string): string {
  const config = JSON.parse(tsconfigBase);
  const paths: Record<string, string[]> = config.compilerOptions.paths;
  const scope = scopeOf(tsconfigBase);
  const alias = `${scope}/${project}`;
  if (alias in paths) {
    throw new Error(`L'alias ${alias} existe déjà dans tsconfig.base.json.`);
  }
  const familyPrefix = `${scope}/${project.slice(0, project.indexOf('-') + 1)}`;
  const entries = Object.entries(paths);
  let insertAt = entries.length;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i][0].startsWith(familyPrefix)) {
      insertAt = i + 1;
      break;
    }
  }
  entries.splice(insertAt, 0, [alias, [`./${root}/src/index.ts`]]);
  config.compilerOptions.paths = Object.fromEntries(entries);
  return json(config);
}

/** Importe le module du domaine dans l'AppModule et l'ajoute juste après CoreModule. */
export function registerModule(appModule: string, name: string, scope: string): string {
  const className = moduleClassName(name);
  const coreImport = new RegExp(`^import \\{ CoreModule \\} from '${scope}/api-core';\\n`, 'm');
  const coreInArray = /(imports:\s*\[\s*CoreModule)(\s*,|\s*\])/;
  if (!coreImport.test(appModule) || !coreInArray.test(appModule)) {
    throw new Error(
      `AppModule inattendu : ajoutez-y à la main l'import de ${className} (${scope}/api-${name}) et le module après CoreModule.`,
    );
  }
  return appModule
    .replace(coreImport, (line) => `${line}import { ${className} } from '${scope}/api-${name}';\n`)
    .replace(coreInArray, (_match, head: string, tail: string) => {
      const multiline = /\n(\s*)CoreModule/.exec(head);
      if (multiline) {
        return `${head},\n${multiline[1]}${className}${tail.trim() === ',' ? ',' : tail}`;
      }
      return `${head}, ${className}${tail}`;
    });
}
