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
import { createApiClient, createQueryClient } from '@nx-react-nestjs/web-data-access';

import { ErrorZone } from './components/error-zone';
import { activateLocale } from './i18n/i18n';
import { createAppRouter } from './router';
import { Route as appRoot, type RouterContext } from './routes/__root';

vi.mock('./i18n/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./i18n/i18n')>();
  return { ...actual, activateLocale: vi.fn<typeof actual.activateLocale>(actual.activateLocale) };
});

const API = 'http://localhost:3000/api/v1';
const api = createApiClient({ baseUrl: API });
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

function renderAt(url: string) {
  const queryClient = createQueryClient();
  renderRouter(
    createAppRouter(queryClient, api, createMemoryHistory({ initialEntries: [url] })),
    queryClient,
  );
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
      context: { queryClient, api },
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
