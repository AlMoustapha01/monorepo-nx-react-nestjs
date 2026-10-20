import { randomUUID } from 'node:crypto';
import { SignJWT } from 'jose';
import { signTestToken, testEnv } from '../../testing';
import { AppConfig } from '../config/app-config';
import { validateEnv } from '../config/env';
import { CoreError } from '../errors/app-error';
import { JwtVerifier } from './jwt-verifier';

describe('JwtVerifier', () => {
  const env = validateEnv(testEnv('postgres://user:pass@localhost:5432/db'));
  const verifier = new JwtVerifier(new AppConfig(env));
  const principal = { userId: randomUUID(), tenantId: randomUUID() };

  it('extrait le principal d’un token valide', async () => {
    await expect(verifier.verify(await signTestToken(principal))).resolves.toEqual(principal);
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
