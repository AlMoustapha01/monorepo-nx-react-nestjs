/**
 * Crée un domaine API vide mais câblé :
 *   pnpm new:domain billing   → libs/api/billing (projet api-billing), alias @<scope>/api-billing,
 *                               BillingModule enregistré dans l'AppModule
 * Puis reformate les fichiers touchés. Le code métier s'écrit ensuite, en TDD.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import {
  addPathAlias,
  domainFiles,
  domainNameProblem,
  moduleClassName,
  registerModule,
  scopeOf,
} from './new-domain-core.mts';

const TSCONFIG = 'tsconfig.base.json';
const APP_MODULE = 'apps/api/src/app/app.module.ts';

const name = process.argv[2] ?? '';
const problem = domainNameProblem(name);
if (problem) {
  console.error(`Usage : pnpm new:domain <nom>\n${problem}`);
  process.exit(1);
}
if (existsSync(`libs/api/${name}`)) {
  console.error(`libs/api/${name} existe déjà.`);
  process.exit(1);
}

// Tout calculer avant d'écrire : une erreur ne laisse pas de domaine à moitié créé.
const tsconfig = readFileSync(TSCONFIG, 'utf8');
const scope = scopeOf(tsconfig);
const edits: Record<string, string> = {
  ...domainFiles(name),
  [TSCONFIG]: addPathAlias(tsconfig, name),
  [APP_MODULE]: registerModule(readFileSync(APP_MODULE, 'utf8'), name, scope),
};

for (const [path, content] of Object.entries(edits)) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content);
}
execFileSync('pnpm', ['exec', 'oxfmt', ...Object.keys(edits)], { stdio: 'inherit' });

console.log(`
Domaine ${name} créé : libs/api/${name} (projet api-${name}), importé par ${scope}/api-${name},
${moduleClassName(name)} enregistré dans ${APP_MODULE}. Ensuite, en TDD :
  domain/        entités et règles, TypeScript pur
  application/   cas d'usage, ports, façade
  infra/         ${name}.schema.ts (pgSchema('${name.replaceAll('-', '_')}')), repositories Drizzle, mappers
  http/          controllers et DTO
  pnpm nx run api:db-generate --name=<sujet>   après la première table
Contrats partagés avec le front : libs/shared/contracts/src/lib/${name}/.`);
