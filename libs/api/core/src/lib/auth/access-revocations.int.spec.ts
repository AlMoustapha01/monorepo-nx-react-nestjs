import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { ClsService } from 'nestjs-cls';
import { startTestDatabase, type TestDatabase } from '../../testing';
import { RequestContext } from '../context/request-context';
import { AccessRevocations } from './access-revocations';
import { accessRevocations } from './access-revocations.schema';

describe('AccessRevocations (real Postgres)', () => {
  const context = new RequestContext(new ClsService(new AsyncLocalStorage()));
  let database: TestDatabase;

  beforeAll(async () => {
    database = await startTestDatabase();
  });
  afterAll(() => database?.stop());

  const at = (iso: string) => new Date(iso);
  const revoke = (tenantId: string, userId: string, revokedAt: Date) =>
    database.adminDb.insert(accessRevocations).values({ tenantId, userId, revokedAt });

  /** Comme le guard : la consultation a lieu au nom du principal du token. */
  const isRevoked = (principal: { tenantId: string; userId: string }, issuedAt?: Date) =>
    context.runAs(principal, () =>
      new AccessRevocations(database.session(context)).isRevoked(principal, issuedAt),
    );

  it('refuses a token issued up to the second of the revocation, accepts one issued after', async () => {
    const principal = { tenantId: randomUUID(), userId: randomUUID() };
    await revoke(principal.tenantId, principal.userId, at('2026-11-17T10:00:00.400Z'));

    expect(await isRevoked(principal, at('2026-11-17T09:59:59.000Z'))).toBe(true);
    // `iat` est en secondes : un token de la seconde de la révocation a pu la précéder.
    expect(await isRevoked(principal, at('2026-11-17T10:00:00.000Z'))).toBe(true);
    expect(await isRevoked(principal, at('2026-11-17T10:00:01.000Z'))).toBe(false);
  });

  it('refuses a token without issue date once access was revoked', async () => {
    const principal = { tenantId: randomUUID(), userId: randomUUID() };
    expect(await isRevoked(principal)).toBe(false);
    await revoke(principal.tenantId, principal.userId, at('2026-11-17T10:00:00.000Z'));
    expect(await isRevoked(principal)).toBe(true);
  });

  it('only revokes the access of this user in this tenant', async () => {
    const tenantId = randomUUID();
    const userId = randomUUID();
    await revoke(tenantId, userId, at('2026-11-17T10:00:00.000Z'));
    const before = at('2026-11-17T09:00:00.000Z');

    expect(await isRevoked({ tenantId, userId: randomUUID() }, before)).toBe(false);
    expect(await isRevoked({ tenantId: randomUUID(), userId }, before)).toBe(false);
  });

  it('lets the request through when the list cannot be read: Postgres down fails the data routes anyway', async () => {
    const principal = { tenantId: randomUUID(), userId: randomUUID() };
    const broken = {
      db: {
        select: () => {
          throw new Error('connection refused');
        },
      },
    };
    const revocations = new AccessRevocations(broken as never);
    await expect(revocations.isRevoked(principal, new Date())).resolves.toBe(false);
  });
});
