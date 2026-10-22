import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { prunePaths, stripExampleBlocks } from './strip-examples-core.mts';

describe('stripExampleBlocks', () => {
  it('retire chaque bloc, lignes des marqueurs comprises', () => {
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

  it('reconnaît les marqueurs JSX, shell/YAML et Markdown', () => {
    for (const [start, end] of [
      ['{/* example:start */}', '{/* example:end */}'],
      ['# example:start', '# example:end'],
      ['<!-- example:start -->', '<!-- example:end -->'],
    ]) {
      const result = stripExampleBlocks(`a\n${start}\nb\n${end}\nc\n`, 'f');
      assert.deepEqual(result, { text: 'a\nc\n', blocks: 1 }, start);
    }
  });

  it("ignore un marqueur cité au milieu d'une ligne", () => {
    const source = 'entre `// example:start` et `// example:end`\n';
    assert.deepEqual(stripExampleBlocks(source, 'f.md'), { text: source, blocks: 0 });
  });

  it('refuse un bloc non fermé, une fin sans début et un bloc imbriqué, avec fichier et ligne', () => {
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

  it("retire les alias dont aucune cible n'existe plus", () => {
    const result = prunePaths(tsconfig, (path) => path.includes('/core/'));
    assert.deepEqual(result.removed, ['@x/api-catalog']);
    assert.deepEqual(JSON.parse(result.text).compilerOptions.paths, {
      '@x/api-core': ['./libs/api/core/src/index.ts'],
    });
  });

  it('ne réécrit rien quand toutes les cibles existent', () => {
    assert.deepEqual(
      prunePaths(tsconfig, () => true),
      { text: tsconfig, removed: [] },
    );
  });
});
