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
  it('names the variables of an app still defined in the root .env', () => {
    const root = 'DATABASE_URL=postgres://x\nPORT=3005\n# VITE_DEV_TOKEN=abc\n';
    assert.deepEqual(appKeysInRoot(root, Object.values(EXAMPLES.apps)), ['PORT']);
  });

  it('finds nothing in a root .env that keeps only the shared variables', () => {
    assert.deepEqual(appKeysInRoot(ROOT_EXAMPLE, Object.values(EXAMPLES.apps)), []);
  });
});

describe('splitLegacyEnv', () => {
  it('moves a value from the legacy .env to the file of the app that reads it', () => {
    const legacy = 'PORT=3005\nVITE_DEV_TOKEN=abc\n';
    const { apps } = splitLegacyEnv(legacy, EXAMPLES);
    assert.match(apps['apps/api/.env'] ?? '', /^PORT=3005$/m);
    assert.match(apps['apps/web/.env'] ?? '', /^VITE_DEV_TOKEN=abc$/m);
  });

  it('keeps the alternative chosen in the legacy .env: the other is commented out', () => {
    const legacy = [
      '# AUTH_JWT_SECRET=change-me',
      'AUTH_JWKS_URL=http://localhost:3100/api/auth/jwks',
    ].join('\n');
    const api = splitLegacyEnv(legacy, EXAMPLES).apps['apps/api/.env'] ?? '';
    assert.match(api, /^# AUTH_JWT_SECRET=change-me$/m);
    assert.match(api, /^AUTH_JWKS_URL=http:\/\/localhost:3100\/api\/auth\/jwks$/m);
  });

  it('keeps the example line, and its comments, for a variable missing from the legacy .env', () => {
    const { apps } = splitLegacyEnv('', EXAMPLES);
    assert.equal(apps['apps/api/.env'], API_EXAMPLE);
  });

  it('takes the last value when the legacy .env defines a variable twice', () => {
    const api = splitLegacyEnv('PORT=3001\nPORT=3002\n', EXAMPLES).apps['apps/api/.env'] ?? '';
    assert.match(api, /^PORT=3002$/m);
  });

  it('keeps at the root the shared variables and those no example declares', () => {
    const legacy = 'DATABASE_URL=postgres://localhost:5433/app\nOTLP_PORT=4319\nPORT=3005\n';
    const { root } = splitLegacyEnv(legacy, EXAMPLES);
    assert.match(root, /^DATABASE_URL=postgres:\/\/localhost:5433\/app$/m);
    assert.match(root, /^OTLP_PORT=4319$/m);
    assert.doesNotMatch(root, /PORT=3005/);
  });
});
