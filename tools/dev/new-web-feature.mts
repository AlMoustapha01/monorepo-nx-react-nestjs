/**
 * Crée une lib feature front vide mais câblée :
 *   pnpm new:web-feature billing   → libs/web/billing (projet web-billing), alias @<scope>/web-billing
 * Puis reformate les fichiers touchés. Les composants s'écrivent ensuite, en TDD ; apps/web les
 * assemble dans ses routes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { addPathAlias, libNameProblem, scopeOf } from './new-domain-core.mts';
import { webFeatureFiles } from './new-web-feature-core.mts';

const TSCONFIG = 'tsconfig.base.json';

const name = process.argv[2] ?? '';
const problem = libNameProblem(name);
if (problem) {
  console.error(`Usage : pnpm new:web-feature <nom>\n${problem}`);
  process.exit(1);
}
if (existsSync(`libs/web/${name}`)) {
  console.error(`libs/web/${name} existe déjà.`);
  process.exit(1);
}

// Tout calculer avant d'écrire : une erreur ne laisse pas de lib à moitié créée.
const tsconfig = readFileSync(TSCONFIG, 'utf8');
const scope = scopeOf(tsconfig);
const edits: Record<string, string> = {
  ...webFeatureFiles(name, scope),
  [TSCONFIG]: addPathAlias(tsconfig, `web-${name}`, `libs/web/${name}`),
};

for (const [path, content] of Object.entries(edits)) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
execFileSync('pnpm', ['exec', 'oxfmt', ...Object.keys(edits)], { stdio: 'inherit' });

console.log(`
Lib web-${name} créée : libs/web/${name}, importée par ${scope}/web-${name}. Ensuite, en TDD :
  src/lib/{components,hooks,data,states}/   tests *.spec.tsx à côté, rendus par renderWithProviders (src/test-utils.tsx)
  src/index.ts                              exports nommés de ce qu'utilise apps/web
  apps/web/src/routes/_authenticated/       la route qui assemble l'écran, derrière requireFeature('<flag>')
  pnpm nx run web:i18n-check                après les premiers textes (catalogues de apps/web)
  apps/web-e2e/src/accessibility.spec.ts    la nouvelle page, son flag dans E2E_FEATURE_FLAGS (src/stack.ts)
Forme de chaque fichier, sur un exemple : docs/reference/feature-web.md`);
