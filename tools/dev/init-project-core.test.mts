import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BOILERPLATE_NAME, projectNameProblem, renameProject } from './init-project-core.mts';

describe('projectNameProblem', () => {
  it('accepte un nom en minuscules, chiffres et tirets', () => {
    assert.equal(projectNameProblem('acme'), undefined);
    assert.equal(projectNameProblem('acme-shop2'), undefined);
  });

  it('refuse un nom vide, avec @, majuscule, espace ou tiret initial', () => {
    for (const name of ['', '@acme', 'Acme', 'acme shop', '-acme', 'acme/web']) {
      assert.ok(projectNameProblem(name), name);
    }
  });

  it('refuse le nom du boilerplate', () => {
    assert.ok(projectNameProblem(BOILERPLATE_NAME));
  });
});

describe('renameProject', () => {
  it('renomme le scope des imports et des alias', () => {
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

  it('renomme le projet et les images de docker compose', () => {
    const compose = 'name: nx-react-nestjs-prod\n    image: nx-react-nestjs-api\n';
    assert.deepEqual(renameProject(compose, 'acme'), {
      text: 'name: acme-prod\n    image: acme-api\n',
      replacements: 2,
    });
  });

  it('laisse le reste intact, y compris le nom seul (titre, URL du repo)', () => {
    const text = [
      '# nx-react-nestjs',
      'repository: https://github.com/x/monorepo-nx-react-nestjs',
      'branch: monorepo-nx-react-nestjs-old',
      '',
    ].join('\n');
    assert.deepEqual(renameProject(text, 'acme'), { text, replacements: 0 });
  });
});
