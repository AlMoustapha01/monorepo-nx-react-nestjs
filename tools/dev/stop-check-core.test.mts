import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { checkCommands, failureReport, planStopCheck } from './stop-check-core.mts';

describe('planStopCheck', () => {
  it('skips when nothing changed on the branch', () => {
    const plan = planStopCheck({ stopHookActive: false, disabled: false, changedFiles: [] });

    assert.equal(plan.run, false);
  });

  it('skips when disabled by STOP_CHECK=off', () => {
    const plan = planStopCheck({ stopHookActive: false, disabled: true, changedFiles: ['a.ts'] });

    assert.equal(plan.run, false);
  });

  it('checks the changed files and blocks the stop on failure', () => {
    const plan = planStopCheck({
      stopHookActive: false,
      disabled: false,
      changedFiles: ['b.ts', 'a.ts', 'a.ts'],
    });

    assert.deepEqual(plan, { run: true, files: ['a.ts', 'b.ts'], block: true });
  });

  it('only warns once the agent already continued because of this hook, to avoid a loop', () => {
    const plan = planStopCheck({ stopHookActive: true, disabled: false, changedFiles: ['a.ts'] });

    assert.deepEqual(plan, { run: true, files: ['a.ts'], block: false });
  });
});

describe('checkCommands', () => {
  it('checks format on the files, then lint and types of the projects they affect', () => {
    const commands = checkCommands(['a.ts', 'b.md'], ['a.ts', 'b.md']);

    assert.deepEqual(
      commands.map((command) => [command.label, command.args]),
      [
        ['format', ['exec', 'oxfmt', '--check', '--no-error-on-unmatched-pattern', 'a.ts', 'b.md']],
        ['lint, typecheck', ['nx', 'affected', '-t', 'lint', 'typecheck', '--files=a.ts,b.md']],
      ],
    );
  });
});

describe('checkCommands with deleted files', () => {
  it('passes deleted files to nx affected, which still maps them to their projects, not to the formatter', () => {
    const commands = checkCommands(['a.ts', 'gone.ts'], ['a.ts']);

    assert.deepEqual(commands.find((command) => command.label === 'format')?.args.slice(-1), [
      'a.ts',
    ]);
    assert.deepEqual(
      commands.find((command) => command.label === 'lint, typecheck')?.args.slice(-1),
      ['--files=a.ts,gone.ts'],
    );
  });

  it('skips the format check when only deletions remain, since oxfmt without a path checks the whole repo', () => {
    const commands = checkCommands(['gone.ts'], []);

    assert.deepEqual(
      commands.map((command) => command.label),
      ['lint, typecheck'],
    );
  });
});

describe('failureReport', () => {
  it('names the failed checks, keeps the end of their output and tells how to fix', () => {
    const output = Array.from({ length: 80 }, (_, i) => `line ${i + 1}`).join('\n');

    const report = failureReport([{ label: 'format', output }]);

    assert.match(report, /format/);
    assert.match(report, /line 80/);
    assert.doesNotMatch(report, /line 1\n/);
    assert.match(report, /pnpm format/);
  });
});
