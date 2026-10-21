import { createAccessTokenSource } from './access-token';

/** JWT non signé : seul `exp` est lu côté client. */
const jwt = (expSeconds: number) =>
  `header.${btoa(JSON.stringify({ exp: expSeconds })).replace(/=+$/, '')}.signature`;

describe('createAccessTokenSource', () => {
  let now = 1_000_000_000_000;
  const clock = () => now;

  it('garde le token jusqu’à une minute de son expiration', async () => {
    const fetchToken = vi.fn<() => Promise<string>>().mockResolvedValue(jwt(now / 1000 + 900));
    const source = createAccessTokenSource(fetchToken, clock);
    const first = await source.getToken({ refresh: false });
    expect(await source.getToken({ refresh: false })).toBe(first);
    expect(fetchToken).toHaveBeenCalledTimes(1);

    now += 850_000; // 50 s avant l'expiration
    await source.getToken({ refresh: false });
    expect(fetchToken).toHaveBeenCalledTimes(2);
  });

  it('partage un seul renouvellement entre appels simultanés', async () => {
    const fetchToken = vi.fn<() => Promise<string>>().mockResolvedValue(jwt(now / 1000 + 900));
    const source = createAccessTokenSource(fetchToken, clock);
    await Promise.all([
      source.getToken({ refresh: false }),
      source.getToken({ refresh: false }),
      source.getToken({ refresh: true }),
    ]);
    expect(fetchToken).toHaveBeenCalledTimes(1);
  });

  it('renouvelle sur demande et après clear()', async () => {
    const fetchToken = vi.fn<() => Promise<string>>().mockResolvedValue(jwt(now / 1000 + 900));
    const source = createAccessTokenSource(fetchToken, clock);
    await source.getToken({ refresh: false });
    await source.getToken({ refresh: true });
    source.clear();
    await source.getToken({ refresh: false });
    expect(fetchToken).toHaveBeenCalledTimes(3);
  });
});
