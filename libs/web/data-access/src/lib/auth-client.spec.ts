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
