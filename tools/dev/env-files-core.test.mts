import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { appKeysInRoot, splitLegacyEnv } from './env-files-core.mts';

const ROOT_EXAMPLE = ['# Infra', 'DATABASE_URL=postgres://localhost:5432/app', ''].join('\n');
const API_EXAMPLE = [
  '# Un seul des deux',
  'AUTH_JWT_SECRET=change-me',
  '# AUTH_JWKS_URL=http://localhost:3100/api/auth/jwks',
  '# AUTH_TENANT_CLAIM=tenant_id',
  'PORT=3000',
  '',
].join('\n');
const WEB_EXAMPLE = ['VITE_API_URL=http://localhost:3000/api/v1', '# VITE_DEV_TOKEN=', ''].join(
  '\n',
);
const EXAMPLES = {
  root: ROOT_EXAMPLE,
  apps: { 'apps/api/.env': API_EXAMPLE, 'apps/web/.env': WEB_EXAMPLE },
};

describe('appKeysInRoot', () => {
  it("nomme les variables d'une app encore définies dans le .env racine", () => {
    const root = 'DATABASE_URL=postgres://x\nPORT=3005\n# VITE_DEV_TOKEN=abc\n';
    assert.deepEqual(appKeysInRoot(root, Object.values(EXAMPLES.apps)), ['PORT']);
  });

  it('ne trouve rien dans un .env racine qui ne garde que les variables communes', () => {
    assert.deepEqual(appKeysInRoot(ROOT_EXAMPLE, Object.values(EXAMPLES.apps)), []);
  });
});

describe('splitLegacyEnv', () => {
  it("reporte une valeur de l'ancien .env dans le fichier de l'app qui la lit", () => {
    const legacy = 'PORT=3005\nVITE_DEV_TOKEN=abc\n';
    const { apps } = splitLegacyEnv(legacy, EXAMPLES);
    assert.match(apps['apps/api/.env'] ?? '', /^PORT=3005$/m);
    assert.match(apps['apps/web/.env'] ?? '', /^VITE_DEV_TOKEN=abc$/m);
  });

  it("garde l'alternative choisie dans l'ancien .env : l'autre est commentée", () => {
    const legacy = [
      '# AUTH_JWT_SECRET=change-me',
      'AUTH_JWKS_URL=http://localhost:3100/api/auth/jwks',
    ].join('\n');
    const api = splitLegacyEnv(legacy, EXAMPLES).apps['apps/api/.env'] ?? '';
    assert.match(api, /^# AUTH_JWT_SECRET=change-me$/m);
    assert.match(api, /^AUTH_JWKS_URL=http:\/\/localhost:3100\/api\/auth\/jwks$/m);
  });

  it("garde la ligne de l'exemple, et ses commentaires, pour une variable absente de l'ancien .env", () => {
    const { apps } = splitLegacyEnv('', EXAMPLES);
    assert.equal(apps['apps/api/.env'], API_EXAMPLE);
  });

  it("prend la dernière valeur quand l'ancien .env définit une variable deux fois", () => {
    const api = splitLegacyEnv('PORT=3001\nPORT=3002\n', EXAMPLES).apps['apps/api/.env'] ?? '';
    assert.match(api, /^PORT=3002$/m);
  });

  it("garde à la racine les variables communes et celles qu'aucun exemple ne déclare", () => {
    const legacy = 'DATABASE_URL=postgres://localhost:5433/app\nOTLP_PORT=4319\nPORT=3005\n';
    const { root } = splitLegacyEnv(legacy, EXAMPLES);
    assert.match(root, /^DATABASE_URL=postgres:\/\/localhost:5433\/app$/m);
    assert.match(root, /^OTLP_PORT=4319$/m);
    assert.doesNotMatch(root, /PORT=3005/);
  });
});
