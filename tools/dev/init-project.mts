/**
 * Renomme un projet issu du boilerplate, à lancer une fois, juste après le clone :
 *   pnpm init:project acme   → imports `@acme/…`, alias, nom du package racine, images compose `acme-…`
 * Exige un arbre git propre, pour relire le résultat avec `git diff` (ou l'annuler).
 * Puis reformate (des imports plus courts changent le découpage des lignes) et vide le cache de Nx.
 * `pnpm create:project` fait la même chose, avec les options du projet.
 */
import { AFTER_RENAME, projectNameProblem } from './init-project-core.mts';
import { assertCleanTree, finish, isRenamed, renameScope } from './project-steps.mts';

const name = process.argv[2] ?? '';
const problem = projectNameProblem(name);
if (problem) {
  console.error(`Usage : pnpm init:project <nom>\n${problem}`);
  process.exit(1);
}

assertCleanTree();
if (isRenamed()) {
  console.error(`Rien à renommer : le projet a déjà été initialisé.`);
  process.exit(1);
}
const { files, replacements } = renameScope(name);
console.log(`${replacements} occurrences renommées dans ${files} fichiers.`);

finish(new Set(), { keepMigrations: false, installDependencies: false });

console.log(`
Projet renommé en @${name}. Ensuite :
  git diff               relire, puis committer
  pnpm check             vérifier
${AFTER_RENAME}`);
