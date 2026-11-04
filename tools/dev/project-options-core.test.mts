import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  checkMarkers,
  parseYesNo,
  prunePaths,
  removeDependencies,
  stripBlocks,
  summarize,
} from './project-options-core.mts';

// Construits par interpolation : une ligne qui ne contient qu'un marqueur serait retirée du test.
const SENTRY_START = `// option:${'sentry'}:start`;
const SENTRY_END = `// option:${'sentry'}:end`;
const DECLARED = ['example', 'option:sentry'];

describe('stripBlocks', () => {
  it('removes each block, marker lines included', () => {
    const source = [
      'import { a } from "a";',
      '// example:start',
      'import { b } from "b";',
      '// example:end',
      'const x = 1;',
      '  // example:start',
      '  b();',
      '  // example:end',
      '',
    ].join('\n');
    assert.deepEqual(stripBlocks(source, 'f.ts', 'example'), {
      text: 'import { a } from "a";\nconst x = 1;\n',
      blocks: 2,
    });
  });

  it('recognizes JSX, shell/YAML and Markdown markers', () => {
    for (const [start, end] of [
      ['{/* example:start */}', '{/* example:end */}'],
      ['# example:start', '# example:end'],
      ['<!-- example:start -->', '<!-- example:end -->'],
    ]) {
      const result = stripBlocks(`a\n${start}\nb\n${end}\nc\n`, 'f', 'example');
      assert.deepEqual(result, { text: 'a\nc\n', blocks: 1 }, start);
    }
  });

  it('ignores a marker quoted in the middle of a line', () => {
    const source = 'entre `// example:start` et `// example:end`\n';
    assert.deepEqual(stripBlocks(source, 'f.md', 'example'), { text: source, blocks: 0 });
  });

  it('rejects an unclosed block, an end without a start and a nested block, with file and line', () => {
    assert.throws(() => stripBlocks('a\n// example:start\nb\n', 'f.ts', 'example'), /f\.ts:2 /);
    assert.throws(() => stripBlocks('a\n// example:end\n', 'f.ts', 'example'), /f\.ts:2 /);
    assert.throws(
      () => stripBlocks('// example:start\n// example:start\n// example:end\n', 'f.ts', 'example'),
      /f\.ts:2 /,
    );
  });

  it('strips only the blocks of the given marker', () => {
    const source = [
      'a',
      SENTRY_START,
      'b',
      SENTRY_END,
      '// example:start',
      'c',
      '// example:end',
      '',
    ];
    assert.deepEqual(stripBlocks(source.join('\n'), 'f.ts', 'option:sentry'), {
      text: 'a\n// example:start\nc\n// example:end\n',
      blocks: 1,
    });
  });
});

describe('checkMarkers', () => {
  it('rejects a block of one option nested in another, with file and line', () => {
    const source = ['// example:start', SENTRY_START, SENTRY_END, '// example:end', ''];
    assert.throws(() => checkMarkers(source.join('\n'), 'f.ts', DECLARED), /f\.ts:2 /);
  });

  it('rejects an unknown option marker', () => {
    const source = `// option:${'foo'}:start\n// option:${'foo'}:end\n`;
    assert.throws(() => checkMarkers(source, 'f.ts', DECLARED), /option:foo/);
  });

  it('rejects an unbalanced block of any declared marker', () => {
    assert.throws(() => checkMarkers(`${SENTRY_START}\n`, 'f.ts', DECLARED), /f\.ts:1 /);
    assert.throws(() => checkMarkers(`a\n${SENTRY_END}\n`, 'f.ts', DECLARED), /f\.ts:2 /);
  });

  it('accepts sequential blocks of different options', () => {
    const source = [SENTRY_START, 'a', SENTRY_END, '// example:start', 'b', '// example:end'];
    assert.doesNotThrow(() => checkMarkers(source.join('\n'), 'f.ts', DECLARED));
  });
});

describe('prunePaths', () => {
  const tsconfig = `{
  "compilerOptions": {
    "paths": {
      "@x/api-core": ["./libs/api/core/src/index.ts"],
      "@x/api-catalog": ["./libs/api/catalog/src/index.ts"]
    }
  }
}
`;

  it('removes the aliases with no remaining target', () => {
    const result = prunePaths(tsconfig, (path) => path.includes('/core/'));
    assert.deepEqual(result.removed, ['@x/api-catalog']);
    assert.deepEqual(JSON.parse(result.text).compilerOptions.paths, {
      '@x/api-core': ['./libs/api/core/src/index.ts'],
    });
  });

  it('rewrites nothing when every target exists', () => {
    assert.deepEqual(
      prunePaths(tsconfig, () => true),
      { text: tsconfig, removed: [] },
    );
  });
});

describe('parseYesNo', () => {
  it('takes the fallback on an empty answer', () => {
    assert.equal(parseYesNo('', true), true);
    assert.equal(parseYesNo('  ', false), false);
  });

  it('reads yes and no in French and English, whatever the case and spaces', () => {
    for (const answer of ['o', 'oui', 'Y', ' yes ']) assert.equal(parseYesNo(answer, false), true);
    for (const answer of ['n', 'non', 'No']) assert.equal(parseYesNo(answer, true), false);
  });

  it('returns undefined for anything else, so that the question is asked again', () => {
    assert.equal(parseYesNo('peut-être', true), undefined);
  });
});

describe('removeDependencies', () => {
  const packageJson = `${JSON.stringify(
    {
      name: 'x',
      dependencies: { '@sentry/core': '^11.4.0', '@sentry/node': '^11.4.0', zod: '^4.0.0' },
      devDependencies: { '@sentry/core': '^11.4.0', vitest: '^4.0.0' },
    },
    null,
    2,
  )}\n`;

  it('removes the packages from dependencies and devDependencies, keeping order and format', () => {
    const result = removeDependencies(packageJson, ['@sentry/core', '@sentry/node']);
    assert.deepEqual(result.removed, ['@sentry/core', '@sentry/node']);
    assert.equal(
      result.text,
      `${JSON.stringify(
        { name: 'x', dependencies: { zod: '^4.0.0' }, devDependencies: { vitest: '^4.0.0' } },
        null,
        2,
      )}\n`,
    );
  });

  it('rewrites nothing when no package is present', () => {
    assert.deepEqual(removeDependencies(packageJson, ['left-pad']), {
      text: packageJson,
      removed: [],
    });
  });
});

describe('summarize', () => {
  it('lists the new scope, the removed options and the regenerated migration', () => {
    const summary = summarize({ name: 'acme', remove: ['examples'], keepMigrations: false }, []);
    assert.match(summary, /@acme/);
    assert.match(summary, /Retirer : examples/);
    assert.match(summary, /migration unique régénérée/);
  });

  it('says that migrations are kept when asked', () => {
    const summary = summarize({ remove: ['examples'], keepMigrations: true }, []);
    assert.match(summary, /migrations gardées/);
    assert.doesNotMatch(summary, /régénérée/);
  });

  it('has no renaming line without a name, and lists what is kept when nothing is removed', () => {
    const summary = summarize({ remove: [], keepMigrations: false }, ['examples']);
    assert.doesNotMatch(summary, /@/);
    assert.match(summary, /Garder : examples/);
    assert.match(summary, /Rien à retirer/);
    assert.doesNotMatch(summary, /migration/);
  });
});
