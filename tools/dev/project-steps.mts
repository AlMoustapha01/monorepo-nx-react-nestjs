/**
 * Étapes à effets (git, fichiers, pnpm) partagées par create:project, init:project et
 * strip:examples. La logique pure est dans project-options-core.mts et init-project-core.mts.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { BOILERPLATE_NAME, renameProject } from './init-project-core.mts';
import {
  checkMarkers,
  optionById,
  PROJECT_OPTIONS,
  prunePaths,
  removeDependencies,
  stripBlocks,
  type OptionId,
  type Regeneration,
} from './project-options-core.mts';

/** Les outils citent volontairement le nom du boilerplate, les marqueurs et les exemples. */
const TOOL_FILES = [
  ':!tools/dev/project-*',
  ':!tools/dev/create-project*',
  ':!tools/dev/strip-examples*',
  ':!tools/dev/init-project*',
];

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });
const run = (args: string[], cwd = '.') => execFileSync('pnpm', args, { stdio: 'inherit', cwd });

/** Fichiers suivis, hors outils ; git grep sort en 1 sans résultat. */
function grep(args: string[], exclude: string[] = []): string {
  try {
    return git('grep', ...args, '--', '.', ...TOOL_FILES, ...exclude);
  } catch {
    return '';
  }
}

function markerFiles(): string[] {
  return grep(['-lz', '-E', '(example|option:[a-z0-9-]+):(start|end)']).split('\0').filter(Boolean);
}

export function assertCleanTree(): void {
  if (git('status', '--porcelain').trim() !== '') {
    console.error(
      'Arbre git modifié : committez ou mettez de côté vos changements, puis relancez.',
    );
    process.exit(1);
  }
}

/** Le scope a déjà été renommé (nom du package racine). */
export function isRenamed(): boolean {
  const { name } = JSON.parse(readFileSync('package.json', 'utf8')) as { name?: string };
  return name !== `@${BOILERPLATE_NAME}/source`;
}

/** Tout valider avant de toucher un fichier : un marqueur mal formé n'arrête rien à mi-chemin. */
export function validateMarkers(): void {
  const markers = PROJECT_OPTIONS.map((option) => option.marker);
  try {
    for (const path of markerFiles()) checkMarkers(readFileSync(path, 'utf8'), path, markers);
  } catch (error) {
    console.error(`Marqueurs invalides, rien n'a été modifié.\n${(error as Error).message}`);
    process.exit(1);
  }
}

/** Options encore présentes : un de leurs fichiers existe, ou un de leurs blocs. */
export function presentOptions(): OptionId[] {
  const texts = markerFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));
  return PROJECT_OPTIONS.filter(
    (option) =>
      option.paths.some((path) => existsSync(path)) ||
      texts.some(({ path, text }) => stripBlocks(text, path, option.marker).blocks > 0),
  ).map((option) => option.id);
}

/** Remplace le scope `@nx-react-nestjs` (imports, alias, package, images compose). */
export function renameScope(name: string): { files: number; replacements: number } {
  const candidates = grep(['-lzF', BOILERPLATE_NAME]).split('\0').filter(Boolean);
  let files = 0;
  let replacements = 0;
  for (const path of candidates) {
    const result = renameProject(readFileSync(path, 'utf8'), name);
    if (result.replacements > 0) {
      writeFileSync(path, result.text);
      files++;
      replacements += result.replacements;
    }
  }
  return { files, replacements };
}

export interface RemovalReport {
  paths: string[];
  blocks: { path: string; blocks: number }[];
  aliases: string[];
  dependencies: string[];
}

/** Supprime les fichiers et les blocs des options, les alias sans cible et leurs paquets. */
export function removeOptions(ids: readonly OptionId[]): RemovalReport {
  const options = ids.map(optionById);
  const blocks: RemovalReport['blocks'] = [];
  const stripped: { path: string; text: string }[] = [];
  for (const path of markerFiles()) {
    let text = readFileSync(path, 'utf8');
    let count = 0;
    for (const option of options) {
      const result = stripBlocks(text, path, option.marker);
      text = result.text;
      count += result.blocks;
    }
    if (count > 0) {
      blocks.push({ path, blocks: count });
      stripped.push({ path, text });
    }
  }
  const paths = options.flatMap((option) => option.paths).filter((path) => existsSync(path));

  for (const path of paths) rmSync(path, { recursive: true });
  for (const { path, text } of stripped) writeFileSync(path, text);
  const tsconfig = prunePaths(readFileSync('tsconfig.base.json', 'utf8'), existsSync);
  writeFileSync('tsconfig.base.json', tsconfig.text);
  const packageJson = removeDependencies(
    readFileSync('package.json', 'utf8'),
    options.flatMap((option) => option.dependencies),
  );
  writeFileSync('package.json', packageJson.text);
  return { paths, blocks, aliases: tsconfig.removed, dependencies: packageJson.removed };
}

/** Lockfile, fichiers générés, format et cache de Nx, dans cet ordre et seulement si besoin. */
export function finish(
  regenerate: ReadonlySet<Regeneration>,
  {
    keepMigrations,
    installDependencies,
  }: { keepMigrations: boolean; installDependencies: boolean },
): void {
  // En CI, pnpm install gèle le lockfile par défaut : il doit suivre les paquets retirés.
  if (installDependencies) run(['install', '--no-frozen-lockfile']);
  if (regenerate.has('migrations') && !keepMigrations) {
    rmSync('apps/api/migrations', { recursive: true, force: true });
    run(['nx', 'run', 'api:db-generate', '--name=init']);
  }
  // Le plugin TanStack Router de Vite régénère routeTree.gen.ts au build.
  if (regenerate.has('routes')) run(['nx', 'run', 'web:build', '--skip-nx-cache']);
  if (regenerate.has('i18n')) run(['exec', 'lingui', 'extract', '--clean'], 'apps/web');
  run(['-s', 'format']);
  run(['nx', 'reset']);
}

export function printReport(report: RemovalReport): void {
  console.log(`\nSupprimés :\n  ${report.paths.join('\n  ') || 'aucun'}`);
  console.log(
    `Blocs retirés :\n  ${report.blocks.map((f) => `${f.path} (${f.blocks})`).join('\n  ') || 'aucun'}`,
  );
  console.log(`Alias retirés : ${report.aliases.join(', ') || 'aucun'}`);
  console.log(`Paquets retirés : ${report.dependencies.join(', ') || 'aucun'}`);
}

/** Règles illustrées par l'option, données de test : à relire, pas à supprimer à l'aveugle. */
export function printLeftovers(ids: readonly OptionId[]): void {
  for (const option of ids.map(optionById)) {
    const leftovers = grep(
      ['-c', '-i', '-E', option.leftovers],
      [':!docs/guides/demarrer-un-projet.md'],
    );
    if (leftovers) {
      console.log(
        `\nMentions de ${option.id} à relire (git grep -n -i -E '${option.leftovers}') :\n${leftovers}`,
      );
    }
  }
}

export function printNextSteps(ids: readonly OptionId[], keepMigrations: boolean): void {
  const options = ids.map(optionById);
  const steps = ['git diff && pnpm check   relire et vérifier, puis committer'];
  for (const option of options) if (option.afterRemoval) steps.push(option.afterRemoval);
  console.log(`\nEnsuite :\n  ${steps.join('\n  ')}`);
  if (!options.some((option) => option.regenerate.includes('migrations'))) return;
  console.log(
    keepMigrations
      ? `Migrations gardées : n'en supprimer ni réécrire aucune. Une fois ce code déployé, générer celle
qui supprime les tables (pnpm nx run api:db-generate --name=drop-<option>) et la relire :
drizzle-kit ne génère pas le DROP SCHEMA d'un pgSchema disparu.`
      : 'Migration unique régénérée. Base locale neuve : docker compose down -v && pnpm dev:setup',
  );
}
