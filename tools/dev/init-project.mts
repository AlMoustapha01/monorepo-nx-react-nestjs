/**
 * Renomme un projet issu du boilerplate, à lancer une fois, juste après le clone :
 *   pnpm init:project acme   → imports `@acme/…`, alias, nom du package racine, images compose `acme-…`
 * Exige un arbre git propre, pour relire le résultat avec `git diff` (ou l'annuler).
 * Puis reformate (des imports plus courts changent le découpage des lignes) et vide le cache de Nx.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { BOILERPLATE_NAME, projectNameProblem, renameProject } from './init-project-core.mts';

const name = process.argv[2] ?? '';
const problem = projectNameProblem(name);
if (problem) {
  console.error(`Usage : pnpm init:project <nom>\n${problem}`);
  process.exit(1);
}

const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' });

if (git('status', '--porcelain').trim() !== '') {
  console.error('Arbre git modifié : committez ou mettez de côté vos changements, puis relancez.');
  process.exit(1);
}

// Fichiers suivis qui citent le nom (git grep ignore les binaires) ; ce script et son test le
// citent volontairement.
let candidates: string[] = [];
try {
  candidates = git('grep', '-lzF', BOILERPLATE_NAME, '--', '.', ':!tools/dev/init-project*')
    .split('\0')
    .filter(Boolean);
} catch {
  // git grep sort en 1 quand rien ne correspond.
}

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

if (replacements === 0) {
  console.error(`Rien à renommer : le projet a déjà été initialisé.`);
  process.exit(1);
}
console.log(`${replacements} occurrences renommées dans ${files} fichiers.`);

execFileSync('pnpm', ['-s', 'format'], { stdio: 'inherit' });
execFileSync('pnpm', ['nx', 'reset'], { stdio: 'inherit' });

console.log(`
Projet renommé en @${name}. Ensuite :
  git diff               relire, puis committer
  pnpm check             vérifier
À adapter à la main : titre du README, MAIL_FROM (.env.example), comptes et organisation de démo
(tools/dev), author et repository de tools/spec-kit/preset/preset.yml (puis specify preset update).`);
