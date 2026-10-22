/**
 * Matrice scénario → tests des specs Spec Kit.
 *   pnpm -s spec:trace                      → toutes les features de specs/ (CI)
 *   pnpm -s spec:trace specs/003-order-note → une seule, en mode strict
 *   pnpm -s spec:trace --base origin/main   → avertit en plus des tests modifiés sans leur spec
 * Chaque scénario d'acceptation actif `NNN-US<story>-AS<n>` doit être cité par au moins un test
 * (`it('003-US1-AS2: …')`) ; une spec en Draft y échappe, sauf si on la vise (mode strict).
 * Aucun test ne doit citer un scénario absent ou retiré. Code de sortie 1 sinon.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  driftedFeatures,
  featureIdOf,
  parseScenarios,
  parseStatus,
  type TestFile,
  type TraceReport,
  traceFeature,
} from './spec-trace-core.mts';

const SPECS_DIR = 'specs';
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
if (dirs.length === 0) {
  console.log(`Aucune spec dans ${SPECS_DIR}/.`);
  if (base) warnDrift(base);
  process.exit(0);
}

const files = testFiles();
let ok = true;
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
}
if (base) warnDrift(base);
process.exit(ok ? 0 : 1);
