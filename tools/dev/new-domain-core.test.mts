import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  addPathAlias,
  domainFiles,
  domainNameProblem,
  moduleClassName,
  registerModule,
  scopeOf,
} from './new-domain-core.mts';

const TSCONFIG = `{
  "compilerOptions": {
    "strict": true,
    "paths": {
      "@acme/contracts": ["./libs/shared/contracts/src/index.ts"],
      "@acme/api-core": ["./libs/api/core/src/index.ts"],
      "@acme/api-core/testing": ["./libs/api/core/src/testing.ts"],
      "@acme/api-catalog": ["./libs/api/catalog/src/index.ts"],
      "@acme/web-ui": ["./libs/web/ui/src/index.ts"]
    }
  },
  "exclude": ["node_modules", "tmp"]
}
`;

// Marqueurs construits : écrits en toutes lettres, strip:examples les retirerait de ce fichier.
const START = `// example:${'start'}`;
const END = `// example:${'end'}`;

const APP_MODULE = `import { Module } from '@nestjs/common';
import { CoreModule } from '@acme/api-core';
${START}
import { CatalogModule } from '@acme/api-catalog';
${END}

@Module({
  imports: [
    CoreModule,
    ${START}
    CatalogModule,
    ${END}
  ],
})
export class AppModule {}
`;

describe('domainNameProblem', () => {
  it('accepts a name of lowercase letters, digits and hyphens', () => {
    assert.equal(domainNameProblem('billing'), undefined);
    assert.equal(domainNameProblem('loyalty-points2'), undefined);
  });

  it('rejects an empty name, or one with an uppercase letter, a space, a hyphen at either end, a double hyphen or a leading digit', () => {
    for (const name of [
      '',
      'Billing',
      'loyalty points',
      '-billing',
      'billing-',
      'a--b',
      '2fa',
      'a/b',
    ]) {
      assert.ok(domainNameProblem(name), name);
    }
  });

  it('rejects reserved names', () => {
    assert.ok(domainNameProblem('core'));
  });
});

describe('moduleClassName', () => {
  it('converts the name to PascalCase, suffixed with Module', () => {
    assert.equal(moduleClassName('billing'), 'BillingModule');
    assert.equal(moduleClassName('loyalty-points'), 'LoyaltyPointsModule');
  });
});

describe('scopeOf', () => {
  it('reads the npm scope from the api-core alias', () => {
    assert.equal(scopeOf(TSCONFIG), '@acme');
  });

  it('fails without an api-core alias', () => {
    assert.throws(() => scopeOf('{ "compilerOptions": { "paths": {} } }'), /api-core/);
  });
});

describe('domainFiles', () => {
  const files = domainFiles('loyalty-points');

  it('creates the lib under libs/api/<name>, with its Nx, TypeScript, Vitest and oxlint config', () => {
    assert.deepEqual(Object.keys(files).sort(), [
      'libs/api/loyalty-points/.oxlintrc.json',
      'libs/api/loyalty-points/project.json',
      'libs/api/loyalty-points/src/index.ts',
      'libs/api/loyalty-points/src/lib/loyalty-points.module.ts',
      'libs/api/loyalty-points/tsconfig.json',
      'libs/api/loyalty-points/tsconfig.lib.json',
      'libs/api/loyalty-points/tsconfig.spec.json',
      'libs/api/loyalty-points/vitest.config.mts',
    ]);
  });

  it('names the project api-<name>, with the domain tags', () => {
    const project = JSON.parse(files['libs/api/loyalty-points/project.json']);
    assert.equal(project.name, 'api-loyalty-points');
    assert.equal(project.sourceRoot, 'libs/api/loyalty-points/src');
    assert.deepEqual(project.tags, ['scope:api', 'type:domain']);
  });

  it('exposes only the module from the facade', () => {
    assert.match(
      files['libs/api/loyalty-points/src/index.ts'],
      /^export \{ LoyaltyPointsModule \} from '\.\/lib\/loyalty-points\.module';$/m,
    );
    assert.doesNotMatch(files['libs/api/loyalty-points/src/index.ts'], /^export \*/m);
    assert.match(
      files['libs/api/loyalty-points/src/lib/loyalty-points.module.ts'],
      /export class LoyaltyPointsModule \{\}/,
    );
  });

  it('passes tests while the lib has none, and forbids framework and persistence in domain/', () => {
    const vitest = files['libs/api/loyalty-points/vitest.config.mts'];
    assert.match(vitest, /passWithNoTests: true/);
    assert.match(vitest, /name: 'api-loyalty-points'/);
    assert.match(vitest, /libs\/api\/loyalty-points'/);
    const oxlint = JSON.parse(files['libs/api/loyalty-points/.oxlintrc.json']);
    assert.equal(oxlint.overrides[0].files[0], 'src/lib/domain/**/*.ts');
    assert.ok(oxlint.overrides[0].rules['no-restricted-imports']);
  });
});

describe('addPathAlias', () => {
  it('adds the alias to the facade after the last API domain', () => {
    const paths = JSON.parse(addPathAlias(TSCONFIG, 'api-billing', 'libs/api/billing'))
      .compilerOptions.paths;
    assert.deepEqual(Object.keys(paths), [
      '@acme/contracts',
      '@acme/api-core',
      '@acme/api-core/testing',
      '@acme/api-catalog',
      '@acme/api-billing',
      '@acme/web-ui',
    ]);
    assert.deepEqual(paths['@acme/api-billing'], ['./libs/api/billing/src/index.ts']);
  });

  it('keeps the rest of the file', () => {
    const config = JSON.parse(addPathAlias(TSCONFIG, 'api-billing', 'libs/api/billing'));
    assert.equal(config.compilerOptions.strict, true);
    assert.deepEqual(config.exclude, ['node_modules', 'tmp']);
  });

  it('rejects an alias that already exists', () => {
    assert.throws(() => addPathAlias(TSCONFIG, 'api-catalog', 'libs/api/catalog'), /existe déjà/);
  });

  it('places a front-end lib after the last web alias', () => {
    const paths = JSON.parse(addPathAlias(TSCONFIG, 'web-billing', 'libs/web/billing'))
      .compilerOptions.paths;
    assert.deepEqual(Object.keys(paths).slice(-2), ['@acme/web-ui', '@acme/web-billing']);
    assert.deepEqual(paths['@acme/web-billing'], ['./libs/web/billing/src/index.ts']);
  });
});

describe('registerModule', () => {
  it('imports the module and adds it after CoreModule, outside the example blocks', () => {
    const result = registerModule(APP_MODULE, 'loyalty-points', '@acme');
    assert.match(
      result,
      /import \{ CoreModule \} from '@acme\/api-core';\nimport \{ LoyaltyPointsModule \} from '@acme\/api-loyalty-points';\n\/\/ example:start/,
    );
    assert.match(
      result,
      /imports: \[\n {4}CoreModule,\n {4}LoyaltyPointsModule,\n {4}\/\/ example:start/,
    );
  });

  it('also works on a single-line array (project without examples)', () => {
    const stripped = `import { Module } from '@nestjs/common';
import { CoreModule } from '@acme/api-core';

@Module({
  imports: [CoreModule],
})
export class AppModule {}
`;
    const result = registerModule(stripped, 'billing', '@acme');
    assert.match(result, /import \{ BillingModule \} from '@acme\/api-billing';/);
    assert.match(result, /imports: \[CoreModule, BillingModule\]/);
  });

  it('fails when the AppModule does not have the expected shape', () => {
    assert.throws(
      () => registerModule('export class AppModule {}', 'billing', '@acme'),
      /AppModule/,
    );
  });
});
