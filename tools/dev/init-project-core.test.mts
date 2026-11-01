import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOILERPLATE_NAME, projectNameProblem, renameProject } from './init-project-core.mts';

describe('projectNameProblem', () => {
  it('accepts a name of lowercase letters, digits and hyphens', () => {
    assert.equal(projectNameProblem('acme'), undefined);
    assert.equal(projectNameProblem('acme-shop2'), undefined);
  });

  it('rejects an empty name, or one with @, an uppercase letter, a space or a leading hyphen', () => {
    for (const name of ['', '@acme', 'Acme', 'acme shop', '-acme', 'acme/web']) {
      assert.ok(projectNameProblem(name), name);
    }
  });

  it('rejects the boilerplate name', () => {
    assert.ok(projectNameProblem(BOILERPLATE_NAME));
  });
});

describe('renameProject', () => {
  it('renames the scope of imports and aliases', () => {
    const source = [
      "import { CoreModule } from '@nx-react-nestjs/api-core';",
      '"@nx-react-nestjs/contracts": ["./libs/shared/contracts/src/index.ts"],',
    ].join('\n');
    assert.deepEqual(renameProject(source, 'acme'), {
      text: [
        "import { CoreModule } from '@acme/api-core';",
        '"@acme/contracts": ["./libs/shared/contracts/src/index.ts"],',
      ].join('\n'),
      replacements: 2,
    });
  });

  it('renames the docker compose project and images', () => {
    const compose = 'name: nx-react-nestjs-prod\n    image: nx-react-nestjs-api\n';
    assert.deepEqual(renameProject(compose, 'acme'), {
      text: 'name: acme-prod\n    image: acme-api\n',
      replacements: 2,
    });
  });

  it('leaves the rest intact, including the bare name (title, repo URL)', () => {
    const text = [
      '# nx-react-nestjs',
      'repository: https://github.com/x/monorepo-nx-react-nestjs',
      'branch: monorepo-nx-react-nestjs-old',
      '',
    ].join('\n');
    assert.deepEqual(renameProject(text, 'acme'), { text, replacements: 0 });
  });
});
