/**
 * Matrice scénario → tests des specs Spec Kit.
 *   pnpm -s spec:trace                      → toutes les features de specs/
 *   pnpm -s spec:trace specs/003-order-note → une seule
 * Chaque scénario d'acceptation `NNN-US<story>-AS<n>` doit être cité par au moins un test
 * (`it('003-US1-AS2: …')`), et aucun test ne doit citer un scénario absent de la spec.
 * Code de sortie 1 sinon.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  featureIdOf,
  parseScenarios,
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
  console.log(`\n## ${featureDir} : ${report.ok ? 'OK' : 'INCOMPLET'}\n`);
  if (report.rows.length === 0) {
    console.log(`Aucun scénario d'acceptation trouvé dans ${join(featureDir, 'spec.md')}.`);
  } else {
    console.log('| Scénario | Tests |');
    console.log('| -------- | ----- |');
    for (const row of report.rows) {
      console.log(`| ${row.id} | ${row.tests.length > 0 ? row.tests.join('<br>') : '**aucun**'} |`);
    }
  }
  for (const orphan of report.orphans) {
    console.log(`\nTest orphelin : ${orphan.path} cite ${orphan.id}, absent de la spec.`);
  }
}

const dirs = featureDirs(process.argv.slice(2));
if (dirs.length === 0) {
  console.log(`Aucune spec dans ${SPECS_DIR}/.`);
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
  const report = traceFeature(
    featureId,
    parseScenarios(featureId, readFileSync(specPath, 'utf8')),
    files,
  );
  print(dir, report);
  ok &&= report.ok;
}
process.exit(ok ? 0 : 1);
