import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { exportJWK, generateKeyPair, type JWK, SignJWT } from 'jose';
import { signTestToken, TEST_AUTH, testEnv } from '../../testing';
import { AppConfig } from '../config/app-config';
import { validateEnv } from '../config/env';
import { CoreError } from '../errors/app-error';
import { JwtVerifier } from './jwt-verifier';

describe('JwtVerifier avec un secret (dev, tests)', () => {
  const env = validateEnv(
    testEnv({
      databaseUrl: 'postgres://user:pass@localhost:5432/db',
      redisUrl: 'redis://localhost:6379',
    }),
  );
  const verifier = new JwtVerifier(new AppConfig(env));
  const principal = { userId: randomUUID(), tenantId: randomUUID() };

  it('extrait le principal d’un token valide, sans rôle par défaut', async () => {
    await expect(verifier.verify(await signTestToken(principal))).resolves.toEqual({
      ...principal,
      roles: [],
    });
  });

  it('garde les rôles connus et ignore les autres', async () => {
    const token = await signTestToken({
      ...principal,
      roles: ['staff', 'superadmin'] as unknown as ['staff'],
    });
    await expect(verifier.verify(token)).resolves.toMatchObject({ roles: ['staff'] });
  });

  it('rejette un token expiré', async () => {
    const token = await signTestToken(principal, '-1m');
    await expect(verifier.verify(token)).rejects.toThrow(CoreError);
  });

  it('rejette un token signé avec une autre clé', async () => {
    const token = await new SignJWT({ tenant_id: principal.tenantId })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(principal.userId)
      .setIssuer(env.AUTH_JWT_ISSUER)
      .setAudience(env.AUTH_JWT_AUDIENCE)
      .setExpirationTime('5m')
      .sign(new TextEncoder().encode('another-secret-that-is-32-characters-long'));
    await expect(verifier.verify(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('JwtVerifier avec un JWKS', () => {
  const principal = { userId: randomUUID(), tenantId: randomUUID() };
  let keys: JWK[] = [];
  let server: Server;
  let jwksUrl: string;

  const verifierFor = (overrides: Record<string, string> = {}) => {
    const raw: Record<string, string> = {
      ...testEnv({
        databaseUrl: 'postgres://user:pass@localhost:5432/db',
        redisUrl: 'redis://localhost:6379',
      }),
      AUTH_JWKS_URL: jwksUrl,
      ...overrides,
    };
    delete raw['AUTH_JWT_SECRET'];
    return new JwtVerifier(new AppConfig(validateEnv(raw)));
  };

  async function newKey(kid: string) {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519' });
    return { kid, privateKey, jwk: { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA' } };
  }

  const sign = (
    key: { kid: string; privateKey: CryptoKey },
    claims: Record<string, unknown> = { tenant_id: principal.tenantId },
    audience: string = TEST_AUTH.audience,
  ) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: 'EdDSA', kid: key.kid })
      .setSubject(principal.userId)
      .setIssuer(TEST_AUTH.issuer)
      .setAudience(audience)
      .setExpirationTime('5m')
      .sign(key.privateKey);

  beforeAll(async () => {
    server = createServer((_request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ keys }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    jwksUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/jwks`;
  });

  afterAll(() => new Promise((resolve) => server.close(resolve)));

  afterEach(() => vi.useRealTimers());

  it('vérifie un token signé par une clé publiée', async () => {
    const key = await newKey('k1');
    keys = [key.jwk];
    await expect(verifierFor().verify(await sign(key))).resolves.toEqual({
      ...principal,
      roles: [],
    });
  });

  it('découvre une nouvelle clé après une rotation', async () => {
    const before = await newKey('before');
    keys = [before.jwk];
    const verifier = verifierFor();
    await verifier.verify(await sign(before));

    const after = await newKey('after');
    keys = [before.jwk, after.jwk];
    // Le JWKS n'est retéléchargé qu'après un délai minimal (30 s) depuis le dernier téléchargement.
    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 31_000 });
    await expect(verifier.verify(await sign(after))).resolves.toMatchObject(principal);
  });

  it('refuse un token HS256 : l’algorithme ne vient pas de l’en-tête', async () => {
    await expect(verifierFor().verify(await signTestToken(principal))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('refuse un token destiné à une autre audience', async () => {
    const key = await newKey('k2');
    keys = [key.jwk];
    const token = await sign(key, { tenant_id: principal.tenantId }, 'another-api');
    await expect(verifierFor().verify(token)).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('refuse un token sans tenant', async () => {
    const key = await newKey('k3');
    keys = [key.jwk];
    await expect(verifierFor().verify(await sign(key, {}))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('lit le tenant et les rôles dans les claims configurées', async () => {
    const key = await newKey('k4');
    keys = [key.jwk];
    const verifier = verifierFor({
      AUTH_TENANT_CLAIM: 'https://shop.example/tenant_id',
      AUTH_ROLES_CLAIM: 'realm_access.roles',
    });
    const token = await sign(key, {
      'https://shop.example/tenant_id': principal.tenantId,
      realm_access: { roles: ['staff', 'offline_access'] },
    });
    await expect(verifier.verify(token)).resolves.toEqual({ ...principal, roles: ['staff'] });
  });

  it('répond 401 et le journalise quand le fournisseur est injoignable', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as AddressInfo;
    await new Promise((resolve) => closed.close(resolve));
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const key = await newKey('k5');
    const verifier = verifierFor({ AUTH_JWKS_URL: `http://127.0.0.1:${port}/jwks` });
    await expect(verifier.verify(await sign(key))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
    expect(warn).toHaveBeenCalledWith(expect.anything(), 'Identity provider keys unavailable');
    warn.mockRestore();
  });
});

describe('validateEnv (authentification)', () => {
  const base = testEnv({
    databaseUrl: 'postgres://user:pass@localhost:5432/db',
    redisUrl: 'redis://localhost:6379',
  });

  it('exige le JWKS ou le secret, pas les deux', () => {
    expect(() => validateEnv({ ...base, AUTH_JWKS_URL: 'https://auth.test/jwks' })).toThrow(
      /exactly one/,
    );
  });

  it('refuse le secret partagé en production', () => {
    expect(() =>
      validateEnv({ ...base, NODE_ENV: 'production', SMTP_URL: 'smtp://mail:25' }),
    ).toThrow(/AUTH_JWT_SECRET is not allowed in production/);
  });
});
