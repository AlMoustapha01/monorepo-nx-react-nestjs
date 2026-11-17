import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createAuthClient } from './auth-client';

const BASE = 'http://auth.test';
const AUTH = `${BASE}/api/auth`;
const server = setupServer();
const auth = createAuthClient({ baseUrl: BASE });

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('createAuthClient', () => {
  it('sends the credentials', async () => {
    let body: unknown;
    server.use(
      http.post(`${AUTH}/sign-in/email`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ redirect: false, token: 'session', user: {} });
      }),
    );
    await auth.signIn({ email: 'ada@shop.test', password: 'secret' });
    expect(body).toEqual({ email: 'ada@shop.test', password: 'secret' });
  });

  it('turns a Better Auth error into an ApiError with its code', async () => {
    server.use(
      http.post(`${AUTH}/sign-in/email`, () =>
        HttpResponse.json(
          { code: 'EMAIL_NOT_VERIFIED', message: 'Email not verified' },
          { status: 403 },
        ),
      ),
    );
    await expect(auth.signIn({ email: 'ada@shop.test', password: 'secret' })).rejects.toMatchObject(
      { name: 'ApiError', status: 403, code: 'EMAIL_NOT_VERIFIED', detail: 'Email not verified' },
    );
  });

  it('reads the session, or null without a session', async () => {
    server.use(http.get(`${AUTH}/get-session`, () => HttpResponse.json(null)));
    await expect(auth.getSession()).resolves.toBeNull();

    server.use(
      http.get(`${AUTH}/get-session`, () =>
        HttpResponse.json({
          user: { id: 'u1', name: 'Ada', email: 'ada@shop.test', emailVerified: true, image: null },
          session: { id: 's1', activeOrganizationId: 'o1' },
        }),
      ),
    );
    await expect(auth.getSession()).resolves.toMatchObject({
      user: { email: 'ada@shop.test' },
      session: { activeOrganizationId: 'o1' },
    });
  });

  it('creates an organization with a unique slug derived from the name', async () => {
    let slug = '';
    server.use(
      http.post(`${AUTH}/organization/create`, async ({ request }) => {
        ({ slug } = (await request.json()) as { slug: string });
        return HttpResponse.json({ id: 'o1', name: 'Café Été', slug });
      }),
    );
    await auth.createOrganization({ name: 'Café Été' });
    expect(slug).toMatch(/^cafe-ete-[0-9a-f]{6}$/);
  });

  it('lists the members of the active organization, with their name', async () => {
    server.use(
      http.get(`${AUTH}/organization/list-members`, ({ request }) =>
        new URL(request.url).searchParams.get('limit') === '500'
          ? HttpResponse.json({
              members: [
                {
                  id: 'm1',
                  userId: 'u1',
                  role: 'owner',
                  organizationId: 'o1',
                  user: { id: 'u1', name: 'Ada', email: 'ada@shop.test', image: null },
                },
              ],
              total: 1,
            })
          : HttpResponse.json({ members: [], total: 0 }),
      ),
    );
    await expect(auth.listMembers()).resolves.toEqual([
      { userId: 'u1', role: 'owner', name: 'Ada', email: 'ada@shop.test' },
    ]);
  });

  it('tells when the password is not enough and a second factor is due', async () => {
    server.use(
      http.post(`${AUTH}/sign-in/email`, () => HttpResponse.json({ twoFactorRedirect: true })),
    );
    await expect(auth.signIn({ email: 'ada@shop.test', password: 'secret' })).resolves.toEqual({
      twoFactorRequired: true,
    });
    server.use(
      http.post(`${AUTH}/sign-in/email`, () =>
        HttpResponse.json({ redirect: false, token: 'session', user: {} }),
      ),
    );
    await expect(auth.signIn({ email: 'ada@shop.test', password: 'secret' })).resolves.toEqual({
      twoFactorRequired: false,
    });
  });

  it('completes the sign-in with a code of the authenticator app or a backup code', async () => {
    const received: { path: string; body: unknown }[] = [];
    server.use(
      http.post(`${AUTH}/two-factor/:method`, async ({ request, params }) => {
        received.push({ path: String(params['method']), body: await request.json() });
        return HttpResponse.json({ token: 'session', user: {} });
      }),
    );
    await auth.verifySecondFactor('123456');
    await auth.verifySecondFactor('abcde-12345', { backupCode: true });
    expect(received).toEqual([
      { path: 'verify-totp', body: { code: '123456' } },
      { path: 'verify-backup-code', body: { code: 'abcde-12345' } },
    ]);
  });

  it('sets up 2FA: secret to scan, backup codes, then confirmation by a first code', async () => {
    server.use(
      http.post(`${AUTH}/two-factor/enable`, () =>
        HttpResponse.json({ totpURI: 'otpauth://totp/Shop:ada', backupCodes: ['a', 'b'] }),
      ),
      http.post(`${AUTH}/two-factor/generate-backup-codes`, () =>
        HttpResponse.json({ status: true, backupCodes: ['c', 'd'] }),
      ),
    );
    await expect(auth.enableTwoFactor('secret')).resolves.toEqual({
      totpURI: 'otpauth://totp/Shop:ada',
      backupCodes: ['a', 'b'],
    });
    await expect(auth.regenerateBackupCodes('secret')).resolves.toEqual(['c', 'd']);
  });

  it('reads the role of the user in the active organization and sets its 2FA requirement', async () => {
    let update: unknown;
    server.use(
      http.get(`${AUTH}/organization/get-active-member-role`, () =>
        HttpResponse.json({ role: 'owner' }),
      ),
      http.post(`${AUTH}/organization/update`, async ({ request }) => {
        update = await request.json();
        return HttpResponse.json({ id: 'o1', name: 'Atelier', slug: 'atelier' });
      }),
    );
    await expect(auth.getActiveMemberRole()).resolves.toBe('owner');
    await auth.setTwoFactorRequirement('o1', true);
    expect(update).toEqual({ organizationId: 'o1', data: { requireTwoFactor: true } });
  });

  it('searches accounts, impersonates one, then stops (back-office, ADR 0019)', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${AUTH}/operator/search`, ({ request }) => {
        calls.push(`search ${new URL(request.url).searchParams.get('query')}`);
        return HttpResponse.json({
          users: [
            {
              id: 'u2',
              email: 'bob@shop.test',
              name: 'Bob',
              organizations: [{ id: 'o1', name: 'Atelier', role: 'owner' }],
            },
          ],
        });
      }),
      http.post(`${AUTH}/admin/impersonate-user`, async ({ request }) => {
        calls.push(`impersonate ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ session: {}, user: {} });
      }),
      http.post(`${AUTH}/admin/stop-impersonating`, () => {
        calls.push('stop');
        return HttpResponse.json({ session: {}, user: {} });
      }),
    );
    await expect(auth.searchAccounts('bob & co')).resolves.toEqual([
      expect.objectContaining({ email: 'bob@shop.test', organizations: [expect.anything()] }),
    ]);
    await auth.impersonate('u2');
    await auth.stopImpersonating();
    expect(calls).toEqual(['search bob & co', 'impersonate {"userId":"u2"}', 'stop']);
  });

  it('reads the role and the impersonation of the session', async () => {
    server.use(
      http.get(`${AUTH}/get-session`, () =>
        HttpResponse.json({
          user: {
            id: 'u2',
            name: 'Bob',
            email: 'bob@shop.test',
            emailVerified: true,
            role: 'user',
          },
          session: { activeOrganizationId: 'o1', impersonatedBy: 'u1' },
        }),
      ),
    );
    await expect(auth.getSession()).resolves.toMatchObject({
      user: { role: 'user' },
      session: { impersonatedBy: 'u1' },
    });
  });

  it('returns undefined as the access token without a session', async () => {
    server.use(http.get(`${AUTH}/token`, () => new HttpResponse(null, { status: 401 })));
    await expect(auth.getAccessToken()).resolves.toBeUndefined();

    server.use(http.get(`${AUTH}/token`, () => HttpResponse.json({ token: 'jwt' })));
    await expect(auth.getAccessToken()).resolves.toBe('jwt');
  });

  it('reports an unreachable service', async () => {
    server.use(http.get(`${AUTH}/get-session`, () => HttpResponse.error()));
    await expect(auth.getSession()).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});

describe('passkeys', () => {
  /** Navigateur simulé : rend une réponse WebAuthn fixe, ou l'erreur d'un utilisateur qui annule. */
  function webAuthn(outcome: 'ok' | 'cancelled' = 'ok') {
    const ceremonies: unknown[] = [];
    const answer = async (options: unknown, autofill?: boolean) => {
      ceremonies.push({ options, autofill });
      if (outcome === 'cancelled') throw new DOMException('The user cancelled', 'NotAllowedError');
      return { id: 'credential' };
    };
    return {
      ceremonies,
      port: {
        supported: () => true,
        autofillSupported: async () => true,
        register: (options: unknown) => answer(options),
        authenticate: answer,
        cancel: () => undefined,
      },
    };
  }

  it('signs in with a passkey: options from the server, the browser ceremony, then the verification', async () => {
    const browser = webAuthn();
    const client = createAuthClient({ baseUrl: BASE, webAuthn: browser.port });
    let verified: unknown;
    server.use(
      http.get(`${AUTH}/passkey/generate-authenticate-options`, () =>
        HttpResponse.json({ challenge: 'c1', rpId: 'localhost' }),
      ),
      http.post(`${AUTH}/passkey/verify-authentication`, async ({ request }) => {
        verified = await request.json();
        return HttpResponse.json({ session: {} });
      }),
    );

    await client.signInWithPasskey({ autofill: true });
    expect(browser.ceremonies).toEqual([
      { options: { challenge: 'c1', rpId: 'localhost' }, autofill: true },
    ]);
    expect(verified).toEqual({ response: { id: 'credential' } });
  });

  it('reports a ceremony the user cancelled, without calling the server', async () => {
    const client = createAuthClient({ baseUrl: BASE, webAuthn: webAuthn('cancelled').port });
    server.use(
      http.get(`${AUTH}/passkey/generate-authenticate-options`, () =>
        HttpResponse.json({ challenge: 'c1' }),
      ),
    );
    await expect(client.signInWithPasskey()).rejects.toMatchObject({ code: 'PASSKEY_CANCELLED' });
  });

  it('registers, lists and deletes the passkeys of the user', async () => {
    const browser = webAuthn();
    const client = createAuthClient({ baseUrl: BASE, webAuthn: browser.port });
    const posted: unknown[] = [];
    server.use(
      http.get(`${AUTH}/passkey/generate-register-options`, () =>
        HttpResponse.json({ challenge: 'r1' }),
      ),
      http.post(`${AUTH}/passkey/verify-registration`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ id: 'p1' });
      }),
      http.get(`${AUTH}/passkey/list-user-passkeys`, () =>
        HttpResponse.json([
          { id: 'p1', name: 'MacBook', createdAt: '2026-11-17T10:00:00.000Z', publicKey: 'x' },
        ]),
      ),
      http.post(`${AUTH}/passkey/delete-passkey`, async ({ request }) => {
        posted.push(await request.json());
        return HttpResponse.json({ status: true });
      }),
    );

    await client.registerPasskey('MacBook');
    await expect(client.listPasskeys()).resolves.toEqual([
      { id: 'p1', name: 'MacBook', createdAt: '2026-11-17T10:00:00.000Z' },
    ]);
    await client.deletePasskey('p1');
    expect(browser.ceremonies).toEqual([{ options: { challenge: 'r1' }, autofill: undefined }]);
    expect(posted).toEqual([{ response: { id: 'credential' }, name: 'MacBook' }, { id: 'p1' }]);
  });
});
