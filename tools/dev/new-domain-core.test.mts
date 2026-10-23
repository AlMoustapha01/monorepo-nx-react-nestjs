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

const APP_MODULE = `import { Module } from '@nestjs/common';
import { CoreModule } from '@acme/api-core';
// example:start
import { CatalogModule } from '@acme/api-catalog';
// example:end

@Module({
  imports: [
    CoreModule,
    // example:start
    CatalogModule,
    // example:end
  ],
})
export class AppModule {}
`;

describe('domainNameProblem', () => {
  it('accepte un nom en minuscules, chiffres et tirets', () => {
    assert.equal(domainNameProblem('billing'), undefined);
    assert.equal(domainNameProblem('loyalty-points2'), undefined);
  });

  it('refuse un nom vide, avec majuscule, espace, tiret en bord, double tiret ou chiffre initial', () => {
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

  it('refuse les noms réservés', () => {
    assert.ok(domainNameProblem('core'));
  });
});

describe('moduleClassName', () => {
  it('passe le nom en PascalCase, suffixé de Module', () => {
    assert.equal(moduleClassName('billing'), 'BillingModule');
    assert.equal(moduleClassName('loyalty-points'), 'LoyaltyPointsModule');
  });
});

describe('scopeOf', () => {
  it("lit le scope npm dans l'alias de api-core", () => {
    assert.equal(scopeOf(TSCONFIG), '@acme');
  });

  it('échoue sans alias api-core', () => {
    assert.throws(() => scopeOf('{ "compilerOptions": { "paths": {} } }'), /api-core/);
  });
});

describe('domainFiles', () => {
  const files = domainFiles('loyalty-points');

  it('crée la lib sous libs/api/<nom>, avec sa config Nx, TypeScript, Vitest et oxlint', () => {
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

  it('nomme le projet api-<nom>, avec les tags de domaine', () => {
    const project = JSON.parse(files['libs/api/loyalty-points/project.json']);
    assert.equal(project.name, 'api-loyalty-points');
    assert.equal(project.sourceRoot, 'libs/api/loyalty-points/src');
    assert.deepEqual(project.tags, ['scope:api', 'type:domain']);
  });

  it("n'expose que le module depuis la façade", () => {
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

  it("passe les tests tant que la lib n'en a aucun, et interdit framework et persistance dans domain/", () => {
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
  it("ajoute l'alias vers la façade après le dernier domaine API", () => {
    const paths = JSON.parse(addPathAlias(TSCONFIG, 'billing')).compilerOptions.paths;
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

  it('garde le reste du fichier', () => {
    const config = JSON.parse(addPathAlias(TSCONFIG, 'billing'));
    assert.equal(config.compilerOptions.strict, true);
    assert.deepEqual(config.exclude, ['node_modules', 'tmp']);
  });

  it('refuse un alias qui existe déjà', () => {
    assert.throws(() => addPathAlias(TSCONFIG, 'catalog'), /existe déjà/);
  });
});

describe('registerModule', () => {
  it("importe le module et l'ajoute après CoreModule, hors des blocs d'exemple", () => {
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

  it('fonctionne aussi sur un tableau sur une ligne (projet sans exemples)', () => {
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

  it("échoue quand l'AppModule n'a pas la forme attendue", () => {
    assert.throws(
      () => registerModule('export class AppModule {}', 'billing', '@acme'),
      /AppModule/,
    );
  });
});
