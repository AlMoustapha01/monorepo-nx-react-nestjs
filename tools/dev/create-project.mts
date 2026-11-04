/**
 * Démarre un projet issu du boilerplate : demande le nom du projet et les options à garder, puis
 * renomme le scope et retire ce qui a été refusé.
 *   pnpm create:project                                        → questions, récapitulatif, confirmation
 *   pnpm create:project --yes --name acme --no-examples        → sans question (CI, scripts)
 * Une option non précisée est gardée avec --yes. Exige un arbre git propre ; rien n'est écrit avant
 * la confirmation. Les étapes sont celles de init:project et strip:examples (project-steps.mts).
 */
import { createInterface, type Interface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { AFTER_RENAME, BOILERPLATE_NAME, projectNameProblem } from './init-project-core.mts';
import {
  optionById,
  parseYesNo,
  PROJECT_OPTIONS,
  summarize,
  type Choices,
  type OptionId,
} from './project-options-core.mts';
import {
  assertCleanTree,
  finish,
  isRenamed,
  presentOptions,
  printLeftovers,
  printNextSteps,
  printReport,
  removeOptions,
  renameScope,
  validateMarkers,
} from './project-steps.mts';

const USAGE = `Usage : pnpm create:project [--name <nom>] [--yes] [--keep-migrations] ${PROJECT_OPTIONS.map(
  (option) => `[--no-${option.id}]`,
).join(' ')}`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

let values: Record<string, string | boolean | undefined>;
try {
  ({ values } = parseArgs({
    options: {
      name: { type: 'string' },
      yes: { type: 'boolean' },
      'keep-migrations': { type: 'boolean' },
      ...Object.fromEntries(PROJECT_OPTIONS.map((option) => [option.id, { type: 'boolean' }])),
    },
    allowNegative: true,
    strict: true,
  }));
} catch (error) {
  fail(`${(error as Error).message}\n${USAGE}`);
}
const yes = values['yes'] === true;
const keepMigrations = values['keep-migrations'] === true;
const nameFlag = values['name'];
if (typeof nameFlag === 'string') {
  const problem = projectNameProblem(nameFlag);
  if (problem) fail(`${problem}\n${USAGE}`);
}

assertCleanTree();
validateMarkers();
if (!yes && !process.stdin.isTTY) {
  fail('Sans terminal, passez --yes et vos choix (ex. --yes --no-sentry).');
}
const renamed = isRenamed();
if (renamed && typeof nameFlag === 'string') {
  fail('Le projet a déjà été renommé : --name est sans effet.');
}

let rl: Interface | undefined;
function interrupted(): never {
  rl?.close();
  console.log("\nInterrompu : rien n'a été modifié.");
  process.exit(130);
}

/** Repose la question tant que la réponse est refusée (`parse` renvoie undefined). */
async function ask<T>(question: string, parse: (answer: string) => T | undefined): Promise<T> {
  if (!rl) {
    rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.on('SIGINT', interrupted);
  }
  for (;;) {
    let answer: string;
    try {
      answer = await rl.question(question);
    } catch {
      // Entrée fermée (Ctrl-D) pendant une question.
      interrupted();
    }
    const parsed = parse(answer);
    if (parsed !== undefined) return parsed;
  }
}

async function askName(): Promise<string | undefined> {
  if (renamed) return undefined;
  if (typeof nameFlag === 'string') return nameFlag;
  if (yes) return undefined;
  const answer = await ask(
    `Nom du projet (scope npm, ex. acme) ; vide pour garder ${BOILERPLATE_NAME} : `,
    (raw) => {
      const name = raw.trim();
      if (name === '') return { name: undefined };
      const problem = projectNameProblem(name);
      if (problem) console.log(problem);
      return problem ? undefined : { name };
    },
  );
  return answer.name;
}

const choices: Choices = { name: await askName(), remove: [], keepMigrations };
const kept: OptionId[] = [];
for (const id of presentOptions()) {
  const flag = values[id];
  const keep =
    typeof flag === 'boolean'
      ? flag
      : yes || (await ask(`${optionById(id).question} [O/n] `, (raw) => parseYesNo(raw, true)));
  (keep ? kept : choices.remove).push(id);
}

if (!choices.name && choices.remove.length === 0) fail('Rien à faire.');
console.log(`\n${summarize(choices, kept)}\n`);
if (!yes && !(await ask('Appliquer ? [o/N] ', (raw) => parseYesNo(raw, false)))) {
  rl?.close();
  console.log("Rien n'a été modifié.");
  process.exit(0);
}
rl?.close();

if (choices.name) {
  const { files, replacements } = renameScope(choices.name);
  console.log(`${replacements} occurrences renommées dans ${files} fichiers.`);
}
const report = choices.remove.length > 0 ? removeOptions(choices.remove) : undefined;
finish(new Set(choices.remove.flatMap((id) => optionById(id).regenerate)), {
  keepMigrations,
  installDependencies: (report?.dependencies.length ?? 0) > 0,
});
if (report) {
  printReport(report);
  printLeftovers(choices.remove);
}
printNextSteps(choices.remove, keepMigrations);
if (choices.name) console.log(AFTER_RENAME);
