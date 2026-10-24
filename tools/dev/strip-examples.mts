/**
 * Retire le code d'exemple (catalog, orders, notifications, boutique du front), une fois, avant le
 * premier déploiement :
 *   pnpm strip:examples                     → supprime les exemples et repart d'une migration unique
 *   pnpm strip:examples --keep-migrations   → projet déjà déployé : garde les migrations appliquées
 * Supprime EXAMPLE_PATHS et les blocs `example:start` … `example:end` des fichiers partagés, puis
 * régénère migrations, routeTree.gen.ts et catalogues Lingui. Exige un arbre git propre.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import {
  EXAMPLE_PATHS,
  LEFTOVER_PATTERN,
  prunePaths,
  stripExampleBlocks,
} from './strip-examples-core.mts';

const { values } = parseArgs({ options: { 'keep-migrations': { type: 'boolean' } } });
const keepMigrations = values['keep-migrations'] === true;

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const run = (args: string[], cwd = '.') => execFileSync('pnpm', args, { stdio: 'inherit', cwd });
/** Fichiers suivis, hors ce script et l'historique des plans ; git grep sort en 1 sans résultat. */
function grep(args: string[], exclude: string[] = []): string {
  const pathspecs = ['.', ':!tools/dev/strip-examples*', ':!docs/archive', ...exclude];
  try {
    return git('grep', ...args, '--', ...pathspecs);
  } catch {
    return '';
  }
}

if (git('status', '--porcelain').trim() !== '') {
  console.error('Arbre git modifié : committez ou mettez de côté vos changements, puis relancez.');
  process.exit(1);
}

// Tout valider avant de toucher un fichier : un marqueur mal formé n'arrête rien à mi-chemin.
const stripped: { path: string; text: string; blocks: number }[] = [];
try {
  for (const path of grep(['-lz', '-E', 'example:(start|end)']).split('\0').filter(Boolean)) {
    const result = stripExampleBlocks(readFileSync(path, 'utf8'), path);
    if (result.blocks > 0) stripped.push({ path, ...result });
  }
} catch (error) {
  console.error(`Marqueurs invalides, rien n'a été modifié.\n${(error as Error).message}`);
  process.exit(1);
}
const removedPaths = EXAMPLE_PATHS.filter((path) => existsSync(path));
if (removedPaths.length === 0 && stripped.length === 0) {
  console.error('Rien à retirer : les exemples ont déjà été retirés.');
  process.exit(1);
}

for (const path of removedPaths) rmSync(path, { recursive: true });
for (const { path, text } of stripped) writeFileSync(path, text);
const tsconfig = prunePaths(readFileSync('tsconfig.base.json', 'utf8'), existsSync);
writeFileSync('tsconfig.base.json', tsconfig.text);

if (!keepMigrations) {
  rmSync('apps/api/migrations', { recursive: true, force: true });
  run(['nx', 'run', 'api:db-generate', '--name=init']);
}
// Le plugin TanStack Router de Vite régénère routeTree.gen.ts au build.
run(['nx', 'run', 'web:build', '--skip-nx-cache']);
run(['exec', 'lingui', 'extract', '--clean'], 'apps/web');
run(['-s', 'format']);
run(['nx', 'reset']);

console.log(`\nSupprimés :\n  ${removedPaths.join('\n  ')}`);
console.log(`Blocs retirés :\n  ${stripped.map((f) => `${f.path} (${f.blocks})`).join('\n  ')}`);
console.log(`Alias retirés : ${tsconfig.removed.join(', ') || 'aucun'}`);

// Règles illustrées par les exemples, données de test : à relire, pas à supprimer à l'aveugle.
const leftovers = grep(
  ['-c', '-i', '-E', LEFTOVER_PATTERN],
  [':!docs/guides/demarrer-un-projet.md'],
);
if (leftovers) {
  console.log(`\nMentions à relire (git grep -n -i -E '${LEFTOVER_PATTERN}') :\n${leftovers}`);
}

// Un flag inconnu empêche l'API de démarrer : celui de la boutique doit sortir du .env local.
const storefrontFlagEnv = ['apps/api/.env', '.env'].find(
  (file) => existsSync(file) && /^FEATURE_FLAGS=.*storefront/m.test(readFileSync(file, 'utf8')),
);
console.log(`Ensuite :
  git diff && pnpm check   relire et vérifier, puis committer${
    storefrontFlagEnv
      ? `\n  retirer storefront de FEATURE_FLAGS dans ${storefrontFlagEnv} (un flag inconnu empêche l'API de démarrer)`
      : ''
  }`);
console.log(
  keepMigrations
    ? `Migrations gardées : n'en supprimer ni réécrire aucune. Une fois ce code déployé, générer celle
qui supprime les tables (pnpm nx run api:db-generate --name=drop-examples) et la relire :
drizzle-kit ne génère pas le DROP SCHEMA d'un pgSchema disparu.`
    : 'Migration unique régénérée. Base locale neuve : docker compose down -v && pnpm dev:setup',
);
