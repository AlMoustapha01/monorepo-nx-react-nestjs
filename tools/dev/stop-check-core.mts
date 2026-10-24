/**
 * Vérification de fin de tour de Claude Code (hook `Stop`, .claude/settings.json) : format, lint
 * et types des seuls fichiers changés sur la branche. Logique pure ; git et pnpm sont dans
 * stop-check.mts.
 */

export interface StopCheckInput {
  /** L'agent continue déjà à cause de ce hook (`stop_hook_active`). */
  stopHookActive: boolean;
  /** `STOP_CHECK=off`. */
  disabled: boolean;
  /** Fichiers modifiés, supprimés ou nouveaux depuis la base (commits, index, arbre). */
  changedFiles: string[];
}

export type StopCheckPlan =
  | { run: false; reason: string }
  | { run: true; files: string[]; block: boolean };

export interface CheckCommand {
  label: string;
  command: string;
  args: string[];
}

export interface CheckFailure {
  label: string;
  output: string;
}

const OUTPUT_TAIL_LINES = 40;

export function planStopCheck(input: StopCheckInput): StopCheckPlan {
  if (input.disabled) return { run: false, reason: 'STOP_CHECK=off' };
  const files = [...new Set(input.changedFiles)].sort();
  if (files.length === 0) return { run: false, reason: 'aucun fichier changé' };
  // Une seconde fin de tour après un blocage n'est qu'avertie : sinon un échec que l'agent ne
  // sait pas corriger le ferait tourner en boucle.
  return { run: true, files, block: !input.stopHookActive };
}

/**
 * `existing` : les fichiers de `files` encore présents. Une suppression ne se formate pas, mais
 * nx en déduit quand même les projets touchés (un import cassé ailleurs).
 */
export function checkCommands(files: string[], existing: string[]): CheckCommand[] {
  const commands: CheckCommand[] = [];
  // Sans chemin, oxfmt vérifierait tout le dépôt.
  if (existing.length > 0) {
    commands.push({
      label: 'format',
      command: 'pnpm',
      args: ['exec', 'oxfmt', '--check', '--no-error-on-unmatched-pattern', ...existing],
    });
  }
  commands.push({
    label: 'lint, typecheck',
    command: 'pnpm',
    args: ['nx', 'affected', '-t', 'lint', 'typecheck', `--files=${files.join(',')}`],
  });
  return commands;
}

export function failureReport(failures: CheckFailure[]): string {
  const sections = failures.map(({ label, output }) => {
    const tail = output.trimEnd().split('\n').slice(-OUTPUT_TAIL_LINES).join('\n');
    return `### ${label}\n\n${tail}`;
  });
  return [
    `Vérification de fin de tour en échec (${failures.map((f) => f.label).join(' ; ')}).`,
    "Corrige avant de rendre la main : `pnpm format` règle le format ; pour le lint et les types, lis l'erreur ci-dessous.",
    "Si l'échec vient de fichiers qui ne sont pas les tiens, dis-le à l'utilisateur au lieu de les modifier.",
    ...sections,
  ].join('\n\n');
}
