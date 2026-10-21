import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient, createQueryClient } from '@nx-react-nestjs/web-data-access';

import { ErrorZone } from './components/error-zone';
import { activateLocale } from './i18n/i18n';
import { createAppRouter } from './router';
import { Route as rootRoute } from './routes/__root';

const api = createApiClient({ baseUrl: 'http://localhost:3000/api/v1' });

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
    expect((await screen.findByRole('heading', { level: 1 })).textContent).toBe('Web boilerplate');
    expect(screen.getByRole('button', { name: 'en' }).getAttribute('aria-pressed')).toBe('true');
    expect(localStorage.getItem('app.locale')).toBe('en');
    expect(document.documentElement.lang).toBe('en');
  });

  // En dernier : `rootRoute.addChildren` modifie la route racine partagée avec `createAppRouter`.
  it('shows the global error page, reports the error and recovers on retry', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let attempts = 0;
    const queryClient = createQueryClient();
    const flaky = createRoute({
      getParentRoute: () => rootRoute,
      path: '/flaky',
      loader: () => {
        attempts += 1;
        if (attempts === 1) throw new Error('boom');
        return 'ok';
      },
      component: () => <p>recovered</p>,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([flaky]),
      context: { queryClient, api },
      history: createMemoryHistory({ initialEntries: ['/flaky'] }),
    });
    renderRouter(router, queryClient);

    const retry = await screen.findByRole('button', { name: 'Réessayer' });
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
