import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createAccessTokenSource,
  createApiClient,
  createAuthClient,
  createQueryClient,
} from '@nx-react-nestjs/web-data-access';

import { ErrorZone } from './components/error-zone';
import { activateLocale } from './i18n/i18n';
import { createAppRouter } from './router';
import { Route as appRoot, type RouterContext } from './routes/__root';
import type { SessionContext } from './session';

vi.mock('./i18n/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./i18n/i18n')>();
  return { ...actual, activateLocale: vi.fn<typeof actual.activateLocale>(actual.activateLocale) };
});

const API = 'http://localhost:3000/api/v1';
const AUTH = 'http://localhost:3100/api/auth';
const api = createApiClient({ baseUrl: API });
const auth = createAuthClient({ baseUrl: 'http://localhost:3100' });

function sessionContext(devMode: boolean): SessionContext {
  return { auth, tokens: createAccessTokenSource(() => auth.getAccessToken()), devMode };
}
const server = setupServer(
  http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: {} })),
);

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function renderRouter(
  router: ReturnType<typeof createAppRouter>,
  queryClient = createQueryClient(),
) {
  render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
}

/** `devMode` : comme avec VITE_DEV_TOKEN, sans connexion. */
function renderAt(url: string, { devMode = true } = {}) {
  const queryClient = createQueryClient();
  const router = createAppRouter(
    { queryClient, api, session: sessionContext(devMode) },
    createMemoryHistory({ initialEntries: [url] }),
  );
  renderRouter(router, queryClient);
  return router;
}

beforeEach(async () => {
  localStorage.clear();
  await activateLocale('fr');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('app', () => {
  it('renders the home page at /', async () => {
    renderAt('/');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Boilerplate web');
    expect(screen.getByRole('main')).toBeTruthy();
  });

  it('shows the catalog and the cart link when storefront is on', async () => {
    server.use(
      http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: { storefront: true } })),
      http.get(`${API}/catalog/products`, () =>
        HttpResponse.json({
          items: [
            {
              id: 'PRD-00000000000000000001',
              sku: 'TEE-WHITE-M',
              name: 'Tee-shirt blanc (M)',
              description: null,
              price: { amountMinor: 1990, currency: 'EUR' },
              status: 'active',
              soldCount: 0,
              version: 1,
              createdAt: '2026-01-01T00:00:00.000Z',
              updatedAt: '2026-01-01T00:00:00.000Z',
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderAt('/');
    expect(await screen.findByText('Tee-shirt blanc (M)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Panier (0)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mes commandes' })).toBeTruthy();
  });

  it('shows the 404 page for an unknown order', async () => {
    const id = 'ORD-00000000000000000001';
    server.use(
      http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: { storefront: true } })),
      http.get(`${API}/orders/${id}`, () =>
        HttpResponse.json(
          { status: 404, code: 'NOT_FOUND', title: 'Not Found', detail: 'Order not found' },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    renderAt(`/commandes/${id}`);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
  });

  it('shows the 404 page for a malformed order ID without calling the API', async () => {
    let calls = 0;
    server.use(
      http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: { storefront: true } })),
      http.get(`${API}/orders/:id`, () => {
        calls += 1;
        return HttpResponse.json(
          { status: 400, code: 'VALIDATION_FAILED', title: 'Bad Request', detail: 'Invalid id' },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );
    renderAt('/commandes/abc');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
    expect(calls).toBe(0);
  });

  it('shows the 404 page on /panier when storefront is off', async () => {
    renderAt('/panier');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
  });

  it('renders the home page when the flags call fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(http.get(`${API}/feature-flags`, () => new HttpResponse(null, { status: 500 })));
    renderAt('/');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Boilerplate web');
    expect(spy.mock.calls.some((c) => c[0] === '[reportError]')).toBe(true);
  });

  it('renders the 404 page inside the layout for an unknown URL', async () => {
    renderAt('/nope');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
    expect(screen.getByRole('link', { name: "Retour à l'accueil" }).getAttribute('href')).toBe('/');
    // Le sélecteur de langue appartient au layout racine.
    expect(screen.getByRole('group', { name: 'Langue' })).toBeTruthy();
  });

  it('switching to en re-renders the home page in English and stores the choice', async () => {
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Web boilerplate' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'en' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('app.locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('keeps the previous locale, reports and toasts when the catalog fails to load', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(activateLocale).mockRejectedValueOnce(new Error('chunk 404'));
    renderAt('/');
    await screen.findByRole('heading', { level: 1 });
    await userEvent.click(screen.getByRole('button', { name: 'en' }));
    expect(await screen.findByText('Impossible de changer de langue.')).toBeTruthy();
    expect(spy.mock.calls.some((c) => c[0] === '[reportError]')).toBe(true);
    expect(screen.getByRole('button', { name: 'fr' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('app.locale')).toBeNull();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('shows the global error page, reports the error and recovers on retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempts = 0;
    const queryClient = createQueryClient();
    // Racine locale : réutilise layout, page d'erreur et 404 sans toucher à l'arbre partagé.
    const testRoot = createRootRouteWithContext<RouterContext>()(appRoot.options);
    const flaky = createRoute({
      getParentRoute: () => testRoot,
      path: '/flaky',
      loader: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('boom');
        return 'ok';
      },
      component: () => <p>recovered</p>,
    });
    const router = createRouter({
      routeTree: testRoot.addChildren([flaky]),
      context: { queryClient, api, session: sessionContext(true) },
      history: createMemoryHistory({ initialEntries: ['/flaky'] }),
    });
    renderRouter(router, queryClient);

    const retry = await screen.findByRole('button', { name: 'Réessayer' });
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(spy.mock.calls.some((c) => c[0] === '[reportError]')).toBe(true);

    await userEvent.click(retry);
    expect(await screen.findByText('recovered')).toBeTruthy();
    expect(attempts).toBe(2);
  });
});

describe('ErrorZone', () => {
  it('shows its fallback and calls reportError', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Bad(): never {
      throw new Error('zone');
    }
    render(
      <ErrorZone fallback={<p>secours</p>}>
        <Bad />
      </ErrorZone>,
    );
    expect(screen.getByText('secours')).toBeTruthy();
    expect(spy.mock.calls.some((c) => c[0] === '[reportError]')).toBe(true);
  });
});

describe('authentification', () => {
  const user = { id: 'u1', name: 'Ada', email: 'ada@shop.test', emailVerified: true };
  let current: unknown;

  beforeEach(() => {
    current = null;
    server.use(
      http.get(`${AUTH}/get-session`, () => HttpResponse.json(current)),
      http.post(`${AUTH}/sign-in/email`, () => {
        current = { user, session: { activeOrganizationId: 'o1' } };
        return HttpResponse.json({ redirect: false, token: 's', user });
      }),
      http.post(`${AUTH}/sign-out`, () => {
        current = null;
        return HttpResponse.json({ success: true });
      }),
      http.get(`${AUTH}/organization/list`, () =>
        HttpResponse.json([{ id: 'o1', name: 'Boutique', slug: 'boutique' }]),
      ),
    );
  });

  async function signIn() {
    const events = userEvent.setup();
    await events.type(await screen.findByLabelText('Adresse email'), 'ada@shop.test');
    await events.type(screen.getByLabelText('Mot de passe'), 'secret-password');
    await events.click(screen.getByRole('button', { name: 'Se connecter' }));
    return events;
  }

  it('renvoie vers la connexion, puis vers la page demandée', async () => {
    const router = renderAt('/panier', { devMode: false });
    expect(await screen.findByRole('heading', { level: 1, name: 'Connexion' })).toBeTruthy();
    expect(router.state.location.search).toEqual({ redirect: '/panier' });

    await signIn();
    // Storefront coupé : la page demandée répond 404, mais on y est bien arrivé, connecté.
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/panier'));
    expect(await screen.findByRole('button', { name: 'Se déconnecter' })).toBeTruthy();
  });

  it('ne suit pas une redirection vers un autre site', async () => {
    const router = renderAt('/connexion?redirect=//evil.example/phish', { devMode: false });
    await signIn();
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/'));
  });

  it('demande de créer une organisation à un utilisateur qui n’en a pas', async () => {
    current = { user, session: { activeOrganizationId: null } };
    renderAt('/', { devMode: false });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Créer votre organisation' }),
    ).toBeTruthy();
  });

  it('déconnecte et revient à la connexion', async () => {
    current = { user, session: { activeOrganizationId: 'o1' } };
    renderAt('/', { devMode: false });
    expect(await screen.findByText('ada@shop.test')).toBeTruthy();
    expect(await screen.findByText('Boutique')).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Se déconnecter' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Connexion' })).toBeTruthy();
  });

  it('envoie à l’API le token du service d’auth', async () => {
    current = { user, session: { activeOrganizationId: 'o1' } };
    const seen: (string | null)[] = [];
    const exp = Math.floor(Date.now() / 1000) + 900;
    const token = `h.${btoa(JSON.stringify({ exp })).replace(/=+$/, '')}.s`;
    server.use(
      http.get(`${AUTH}/token`, () => HttpResponse.json({ token })),
      http.get(`${API}/feature-flags`, ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({ flags: {} });
      }),
    );
    const queryClient = createQueryClient();
    const session = sessionContext(false);
    const authedApi = createApiClient({ baseUrl: API, getToken: session.tokens.getToken });
    renderRouter(
      createAppRouter(
        { queryClient, api: authedApi, session },
        createMemoryHistory({ initialEntries: ['/'] }),
      ),
      queryClient,
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Boilerplate web' })).toBeTruthy();
    expect(seen).toEqual([`Bearer ${token}`]);
  });
});
