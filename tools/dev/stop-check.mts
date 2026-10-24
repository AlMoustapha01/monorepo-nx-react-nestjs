/**
 * Hook `Stop` de Claude Code (.claude/settings.json) : à chaque fin de tour, format, lint et types
 * des fichiers changés sur la branche depuis origin/main, suppressions comprises. En échec, l'agent reprend la main avec
 * l'erreur (code 2) ; une seconde fois de suite, l'utilisateur est seulement averti.
 *   STOP_CHECK=off  → désactivé (ex. arbre partagé avec une autre session en cours)
 * Les tests restent à la charge de /speckit-implement et de la CI : trop lents pour chaque tour.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import {
  type CheckFailure,
  checkCommands,
  failureReport,
  planStopCheck,
} from './stop-check-core.mts';

function git(args: string[]): string {
  return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function hookInput(): { stop_hook_active?: boolean } {
  try {
    return JSON.parse(readFileSync(0, 'utf8') || '{}');
  } catch {
    return {};
  }
}

function baseRef(): string {
  for (const ref of ['origin/main', 'main']) {
    try {
      return git(['merge-base', ref, 'HEAD']).trim();
    } catch {
      // ref absente : essayer la suivante
    }
  }
  return 'HEAD';
}

function changedFiles(): string[] {
  const lines = [
    ...git(['diff', '--name-only', baseRef()]).split('\n'),
    ...git(['ls-files', '--others', '--exclude-standard']).split('\n'),
  ];
  return lines.filter(Boolean);
}

const plan = planStopCheck({
  stopHookActive: hookInput().stop_hook_active === true,
  disabled: process.env['STOP_CHECK'] === 'off',
  changedFiles: changedFiles(),
});
if (!plan.run) process.exit(0);

const failures: CheckFailure[] = [];
const existing = plan.files.filter((path) => existsSync(path));
for (const { label, command, args } of checkCommands(plan.files, existing)) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) {
    failures.push({ label, output: `${result.stdout ?? ''}${result.stderr ?? ''}` });
  }
}
if (failures.length === 0) process.exit(0);

const report = failureReport(failures);
if (plan.block) {
  console.error(report);
  process.exit(2);
}
console.log(JSON.stringify({ systemMessage: report }));
