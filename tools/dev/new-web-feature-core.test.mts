import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { webFeatureFiles } from './new-web-feature-core.mts';

describe('webFeatureFiles', () => {
  const files = webFeatureFiles('loyalty-points', '@acme');
  const root = 'libs/web/loyalty-points';

  it('crée la lib sous libs/web/<nom>, avec sa config Nx, TypeScript, Vitest, oxlint et Lingui', () => {
    assert.deepEqual(Object.keys(files).sort(), [
      `${root}/.oxlintrc.json`,
      `${root}/lingui.config.ts`,
      `${root}/project.json`,
      `${root}/src/index.ts`,
      `${root}/src/test-setup.ts`,
      `${root}/src/test-utils.tsx`,
      `${root}/tsconfig.json`,
      `${root}/tsconfig.lib.json`,
      `${root}/tsconfig.spec.json`,
      `${root}/vitest.config.mts`,
    ]);
  });

  it('nomme le projet web-<nom>, avec les tags de feature', () => {
    const project = JSON.parse(files[`${root}/project.json`]);
    assert.equal(project.name, 'web-loyalty-points');
    assert.equal(project.sourceRoot, `${root}/src`);
    assert.deepEqual(project.tags, ['scope:web', 'type:feature']);
  });

  it("passe les tests tant que la lib n'en a aucun, et compile la macro Lingui", () => {
    const vitest = files[`${root}/vitest.config.mts`];
    assert.match(vitest, /passWithNoTests: true/);
    assert.match(vitest, /name: 'web-loyalty-points'/);
    assert.match(vitest, /environment: 'jsdom'/);
    assert.match(vitest, /@lingui\/babel-plugin-lingui-macro/);
    assert.match(vitest, /lingui\(\{ cwd: import\.meta\.dirname \}\)/);
    assert.match(vitest, /libs\/web\/loyalty-points'/);
  });

  it('applique les règles de lint web', () => {
    assert.deepEqual(JSON.parse(files[`${root}/.oxlintrc.json`]), {
      extends: ['../.oxlintrc.web.json'],
    });
  });

  it('active noUncheckedIndexedAccess et JSX', () => {
    const options = JSON.parse(files[`${root}/tsconfig.json`]).compilerOptions;
    assert.equal(options.noUncheckedIndexedAccess, true);
    assert.equal(options.jsx, 'react-jsx');
  });

  it('rend les composants avec le data-access du projet', () => {
    assert.match(
      files[`${root}/src/test-utils.tsx`],
      /import \{ createQueryClient \} from '@acme\/web-data-access';/,
    );
  });

  it("n'expose rien tant que la façade est vide, sans export *", () => {
    const index = files[`${root}/src/index.ts`];
    assert.match(index, /^export \{\};$/m);
    assert.doesNotMatch(index, /^export \*/m);
  });
});
