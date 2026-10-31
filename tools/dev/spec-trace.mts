/**
 * Matrice scénario → tests des specs Spec Kit.
 *   pnpm -s spec:trace                      → toutes les features de specs/ (CI)
 *   pnpm -s spec:trace specs/003-order-note → une seule, en mode strict
 *   pnpm -s spec:trace --base origin/main   → avertit en plus des tests modifiés sans leur spec
 * Chaque scénario d'acceptation actif `NNN-US<story>-AS<n>` doit être cité par au moins un test
 * (`it('003-US1-AS2: …')`) ; une spec en Draft y échappe, sauf si on la vise (mode strict).
 * Aucun test ne doit citer un scénario absent ou retiré. Code de sortie 1 sinon.
 * Si specs/product.yml existe, chaque spec nomme les exigences qu'elle implémente
 * (`**Product Requirements**:`), toutes présentes dans l'index ; sans argument, la commande
 * affiche aussi l'état de chaque epic, de chaque exigence et la couverture des parcours. Un epic
 * terminé exige un test par parcours (`E03-J1: …`).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  driftedFeatures,
  featureIdOf,
  type EpicReport,
  parseProductIndex,
  parseRequirementRefs,
  parseScenarios,
  parseStatus,
  type ProductIndex,
  type RequirementReport,
  type SpecRequirementRefs,
  type TestFile,
  type TraceReport,
  traceEpics,
  traceFeature,
  traceRequirements,
} from './spec-trace-core.mts';

const SPECS_DIR = 'specs';
const REQUIREMENT_INDEX = join(SPECS_DIR, 'product.yml');
const LEGACY_INDEX = join(SPECS_DIR, 'product-requirements.json');
const TEST_FILE = /\.spec\.tsx?$/;

function featureDirs(args: string[]): string[] {
  if (args.length > 0) return args;
  if (!existsSync(SPECS_DIR)) return [];
  return readdirSync(SPECS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(SPECS_DIR, entry.name, 'spec.md')))
    .map((entry) => join(SPECS_DIR, entry.name))
    .sort();
}

// Fichiers suivis et nouveaux (pas encore ajoutés), hors fichiers ignorés (node_modules, dist…).
function testFiles(): TestFile[] {
  const output = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return output
    .split('\n')
    .filter((path) => TEST_FILE.test(path) && existsSync(path))
    .map((path) => ({ path, content: readFileSync(path, 'utf8') }));
}

function print(featureDir: string, report: TraceReport): void {
  console.log(`\n## ${featureDir} (${report.status}) : ${report.ok ? 'OK' : 'INCOMPLET'}\n`);
  if (report.rows.length === 0) {
    console.log(`Aucun scénario d'acceptation trouvé dans ${join(featureDir, 'spec.md')}.`);
  } else {
    console.log('| Scénario | Tests |');
    console.log('| -------- | ----- |');
    for (const row of report.rows) {
      const tests = row.tests.length > 0 ? row.tests.join('<br>') : row.retired ? '' : '**aucun**';
      console.log(`| ${row.id}${row.retired ? ' (retiré)' : ''} | ${tests} |`);
    }
  }
  if (!report.coverageRequired && report.status === 'Draft' && report.uncovered.length > 0) {
    console.log(
      `\nSpec en Draft : ${report.uncovered.length} scénario(s) encore sans test, toléré. ` +
        'Passer le statut à Implemented quand tous sont couverts.',
    );
  }
  for (const orphan of report.orphans) {
    console.log(`\nTest orphelin : ${orphan.path} cite ${orphan.id}, absent de la spec.`);
  }
  for (const stale of report.retiredCited) {
    console.log(`\nTest périmé : ${stale.path} cite ${stale.id}, scénario retiré.`);
  }
}

function printRequirements(
  report: RequirementReport,
  { hasIndex, showRows }: { hasIndex: boolean; showRows: boolean },
): void {
  if (showRows) {
    console.log(`\n## Exigences (${REQUIREMENT_INDEX}) : ${report.ok ? 'OK' : 'INCOMPLET'}\n`);
    console.log('| Exigence | État | Specs |');
    console.log('| -------- | ---- | ----- |');
    for (const row of report.rows) {
      const specs = row.specs.map((spec) => `${spec.featureDir} (${spec.status})`).join('<br>');
      const state = row.state === 'Unspecified' ? '**non spécifiée**' : row.state;
      console.log(`| ${row.id} ${row.title} | ${state} | ${specs} |`);
    }
  }
  for (const { featureDir, id } of report.unknown) {
    const where = hasIndex
      ? `absente de ${REQUIREMENT_INDEX}`
      : `et ${REQUIREMENT_INDEX} n'existe pas`;
    console.log(`\nExigence inconnue : ${featureDir}/spec.md cite ${id}, ${where}.`);
  }
  for (const { featureDir, id } of report.retiredCited) {
    console.log(
      `\nAvertissement : ${featureDir}/spec.md cite ${id}, exigence retirée dans ${REQUIREMENT_INDEX} ` +
        "(retirer la spec, ou la rattacher à l'exigence qui la remplace).",
    );
  }
  for (const featureDir of report.missingLine) {
    console.log(
      `\nLigne **Product Requirements** absente de ${featureDir}/spec.md ` +
        `(les exigences de ${REQUIREMENT_INDEX} qu'elle implémente, ou None).`,
    );
  }
}

function printEpics(report: EpicReport, { showRows }: { showRows: boolean }): void {
  if (showRows && report.rows.length > 0) {
    console.log(`\n## Epics (${REQUIREMENT_INDEX}) : ${report.ok ? 'OK' : 'INCOMPLET'}\n`);
    console.log('| Epic | État | Exigences | Dépend de |');
    console.log('| ---- | ---- | --------- | --------- |');
    for (const row of report.rows) {
      const state = row.state === 'Unspecified' ? '**non spécifié**' : row.state;
      console.log(
        `| ${row.id} ${row.title} | ${state} | ${row.requirements.join(', ')} | ${row.dependsOn.join(', ')} |`,
      );
    }
  }
  if (showRows && report.journeys.length > 0) {
    console.log('\n| Parcours | Tests |');
    console.log('| -------- | ----- |');
    for (const journey of report.journeys) {
      const tests =
        journey.tests.length > 0 ? journey.tests.join('<br>') : journey.retired ? '' : '**aucun**';
      console.log(
        `| ${journey.id}${journey.retired ? ' (retiré)' : ''} ${journey.title} | ${tests} |`,
      );
    }
  }
  for (const id of report.uncovered) {
    console.log(`\nParcours sans test : ${id}, alors que son epic est terminé.`);
  }
  for (const orphan of report.orphans) {
    console.log(
      `\nTest orphelin : ${orphan.path} cite ${orphan.id}, parcours absent de ${REQUIREMENT_INDEX}.`,
    );
  }
  for (const stale of report.retiredCited) {
    console.log(`\nTest périmé : ${stale.path} cite ${stale.id}, parcours retiré.`);
  }
  for (const { featureDir, epicId, waitingOn } of report.blocked) {
    console.log(
      `\nAvertissement : ${featureDir} avance sur ${epicId}, qui dépend de ${waitingOn.join(', ')}, ` +
        'pas encore terminé (Implemented).',
    );
  }
}

// Exigences citées par toutes les specs de specs/ ; une spec illisible est signalée quand on la
// vise, et ignorée ici.
function allRequirementRefs(): SpecRequirementRefs[] {
  return featureDirs([]).flatMap((featureDir) => {
    const spec = readFileSync(join(featureDir, 'spec.md'), 'utf8');
    try {
      return [{ featureDir, status: parseStatus(spec), refs: parseRequirementRefs(spec) }];
    } catch {
      return [];
    }
  });
}

// Tests modifiés depuis la base (commits et fichiers en cours) dont la spec n'a pas bougé.
function warnDrift(base: string): void {
  const git = (args: string[]) =>
    execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const mergeBase = git(['merge-base', base, 'HEAD']).trim();
  const diff = git(['diff', '-U0', mergeBase, '--', '*.spec.ts', '*.spec.tsx']);
  const changed = [
    ...git(['diff', '--name-only', mergeBase]).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ].filter(Boolean);
  const drift = driftedFeatures(diff, changed);
  if (drift.length === 0) return;

  console.log('\n## Avertissements\n');
  for (const { featureId, paths } of drift) {
    const message =
      `Des tests qui citent les scénarios ${featureId}-… ont changé, pas specs/${featureId}-*/spec.md. ` +
      'Si le comportement a changé, mettre la spec à jour dans la même PR.';
    console.log(`- ${message} (${paths.join(', ')})`);
    // Annotation visible dans la PR, sans faire échouer le job.
    if (process.env['GITHUB_ACTIONS'] === 'true') {
      for (const path of paths) console.log(`::warning file=${path}::${message}`);
    }
  }
}

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const base = baseIndex >= 0 ? args.splice(baseIndex, 2)[1] : undefined;
if (baseIndex >= 0 && !base) {
  console.error('--base attend une référence git (ex. origin/main).');
  process.exit(1);
}
// Viser une feature, c'est vérifier qu'elle est complète : même en Draft, tout scénario a son test.
const strict = args.length > 0;
const dirs = featureDirs(args);
if (existsSync(LEGACY_INDEX)) {
  console.error(
    `${LEGACY_INDEX} n'est plus lu : l'index du produit est ${REQUIREMENT_INDEX} ` +
      '(mêmes exigences en YAML, plus les epics). Voir docs/guides/spec-kit.md#index-du-produit.',
  );
  process.exit(1);
}
let index: ProductIndex | undefined;
if (existsSync(REQUIREMENT_INDEX)) {
  try {
    index = parseProductIndex(readFileSync(REQUIREMENT_INDEX, 'utf8'));
  } catch (error) {
    console.error(`${REQUIREMENT_INDEX} : ${(error as Error).message}`);
    process.exit(1);
  }
}
if (dirs.length === 0 && !index) {
  console.log(`Aucune spec dans ${SPECS_DIR}/.`);
  if (base) warnDrift(base);
  process.exit(0);
}

const files = testFiles();
let ok = true;
const requirementRefs: SpecRequirementRefs[] = [];
for (const dir of dirs) {
  const specPath = join(dir, 'spec.md');
  if (!existsSync(specPath)) {
    console.error(`${specPath} introuvable.`);
    ok = false;
    continue;
  }
  const featureId = featureIdOf(dir);
  const spec = readFileSync(specPath, 'utf8');
  let status;
  try {
    status = parseStatus(spec);
  } catch (error) {
    console.error(`${specPath} : ${(error as Error).message}`);
    ok = false;
    continue;
  }
  const report = traceFeature(
    featureId,
    parseScenarios(featureId, spec),
    { status, strict },
    files,
  );
  print(dir, report);
  ok &&= report.ok;
  requirementRefs.push({ featureDir: dir, status, refs: parseRequirementRefs(spec) });
}
const requirements = traceRequirements(index, requirementRefs);
// Le tableau des exigences n'a de sens que sur toutes les specs.
printRequirements(requirements, {
  hasIndex: index !== undefined,
  showRows: index !== undefined && !strict,
});
ok &&= requirements.ok;
// L'état d'un epic dépend de toutes les specs, même quand on n'en vise qu'une : sinon une v2 en
// Draft ailleurs passerait inaperçue et l'epic paraîtrait terminé.
const allRows = strict ? traceRequirements(index, allRequirementRefs()).rows : requirements.rows;
// Sans index, un test qui cite un parcours reste orphelin.
const epics = traceEpics(index ?? { requirements: [], epics: [] }, allRows, requirementRefs, files);
printEpics(epics, { showRows: !strict });
ok &&= epics.ok;
if (base) warnDrift(base);
process.exit(ok ? 0 : 1);
