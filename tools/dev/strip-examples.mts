/**
 * Retire le code d'exemple (catalog, orders, notifications, boutique du front), une fois, avant le
 * premier déploiement :
 *   pnpm strip:examples                     → supprime les exemples et repart d'une migration unique
 *   pnpm strip:examples --keep-migrations   → projet déjà déployé : garde les migrations appliquées
 * Supprime les fichiers de l'option `examples` et les blocs `example:start` … `example:end` des
 * fichiers partagés, puis régénère migrations, routeTree.gen.ts et catalogues Lingui. Exige un arbre
 * git propre. `pnpm create:project` fait la même chose, avec les autres options.
 */
import { parseArgs } from 'node:util';
import { optionById } from './project-options-core.mts';
import {
  assertCleanTree,
  finish,
  presentOptions,
  printLeftovers,
  printNextSteps,
  printReport,
  removeOptions,
  validateMarkers,
} from './project-steps.mts';

const { values } = parseArgs({ options: { 'keep-migrations': { type: 'boolean' } } });
const keepMigrations = values['keep-migrations'] === true;

assertCleanTree();
validateMarkers();
if (!presentOptions().includes('examples')) {
  console.error('Rien à retirer : les exemples ont déjà été retirés.');
  process.exit(1);
}

const report = removeOptions(['examples']);
finish(new Set(optionById('examples').regenerate), {
  keepMigrations,
  installDependencies: report.dependencies.length > 0,
});
printReport(report);
printLeftovers(['examples']);
printNextSteps(['examples'], keepMigrations);
