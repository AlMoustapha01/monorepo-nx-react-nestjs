import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prunePaths, stripExampleBlocks } from './strip-examples-core.mts';

describe('stripExampleBlocks', () => {
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
    assert.deepEqual(stripExampleBlocks(source, 'f.ts'), {
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
      const result = stripExampleBlocks(`a\n${start}\nb\n${end}\nc\n`, 'f');
      assert.deepEqual(result, { text: 'a\nc\n', blocks: 1 }, start);
    }
  });

  it('ignores a marker quoted in the middle of a line', () => {
    const source = 'entre `// example:start` et `// example:end`\n';
    assert.deepEqual(stripExampleBlocks(source, 'f.md'), { text: source, blocks: 0 });
  });

  it('rejects an unclosed block, an end without a start and a nested block, with file and line', () => {
    assert.throws(() => stripExampleBlocks('a\n// example:start\nb\n', 'f.ts'), /f\.ts:2 /);
    assert.throws(() => stripExampleBlocks('a\n// example:end\n', 'f.ts'), /f\.ts:2 /);
    assert.throws(
      () => stripExampleBlocks('// example:start\n// example:start\n// example:end\n', 'f.ts'),
      /f\.ts:2 /,
    );
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
