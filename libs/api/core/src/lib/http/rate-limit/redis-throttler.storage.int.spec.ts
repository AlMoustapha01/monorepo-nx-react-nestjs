import { createServer } from 'node:net';
import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { startTestRedis, testEnv, type TestRedis } from '../../../testing';
import { AppConfig } from '../../config/app-config';
import { validateEnv } from '../../config/env';
import { RedisThrottlerStorage } from './redis-throttler.storage';

const storageFor = (redisUrl: string) =>
  new RedisThrottlerStorage(
    new AppConfig(
      validateEnv(testEnv({ databaseUrl: 'postgres://user:pass@localhost:5432/db', redisUrl })),
    ),
  );

describe('RedisThrottlerStorage', () => {
  let redis: TestRedis;
  let storage: RedisThrottlerStorage;
  let client: Redis;

  beforeAll(async () => {
    redis = await startTestRedis();
    storage = storageFor(redis.url);
    client = new Redis(redis.url);
  });

  afterAll(async () => {
    await storage?.onApplicationShutdown();
    client?.disconnect();
    await redis?.stop();
  });

  it('compte les requêtes et bloque au-delà de la limite', async () => {
    const hit = () => storage.increment('alice', 60_000, 2, 30_000, 'default');
    await expect(hit()).resolves.toMatchObject({ totalHits: 1, isBlocked: false });
    await expect(hit()).resolves.toMatchObject({ totalHits: 2, isBlocked: false });
    await expect(hit()).resolves.toMatchObject({
      totalHits: 3,
      isBlocked: true,
      timeToBlockExpire: 30,
    });
  });

  it('partage le compteur entre instances, et chaque clé a son propre compteur', async () => {
    const other = storageFor(redis.url);
    await storage.increment('bob', 60_000, 5, 60_000, 'default');
    await expect(other.increment('bob', 60_000, 5, 60_000, 'default')).resolves.toMatchObject({
      totalHits: 2,
    });
    await expect(other.increment('carol', 60_000, 5, 60_000, 'default')).resolves.toMatchObject({
      totalHits: 1,
    });
    await other.onApplicationShutdown();
  });

  it('pose un TTL sur chaque clé', async () => {
    await storage.increment('dave', 60_000, 1, 30_000, 'default');
    await storage.increment('dave', 60_000, 1, 30_000, 'default');
    const keys = await client.keys('rate-limit:{default:dave}*');
    expect(keys).toHaveLength(2);
    for (const key of keys) {
      expect(await client.pttl(key)).toBeGreaterThan(0);
    }
  });

  it('laisse passer quand Redis est injoignable', async () => {
    const closed = createServer();
    await new Promise<void>((resolve) => closed.listen(0, '127.0.0.1', resolve));
    const { port } = closed.address() as { port: number };
    await new Promise((resolve) => closed.close(resolve));
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);

    const down = storageFor(`redis://127.0.0.1:${port}`);
    await expect(down.increment('eve', 60_000, 1, 60_000, 'default')).resolves.toMatchObject({
      isBlocked: false,
    });
    expect(warn).toHaveBeenCalledOnce();
    await down.onApplicationShutdown();
    warn.mockRestore();
  });
});
