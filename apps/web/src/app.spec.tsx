import {
  createMemoryHistory,
  createRoute,
  createRootRouteWithContext,
  createRouter,
} from '@tanstack/react-router';
import { http, HttpResponse } from 'msw';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createQueryClient } from '@nx-react-nestjs/web-data-access';

import { ErrorZone } from './components/error-zone';
import { activateLocale } from './i18n/i18n';
import { Route as appRoot, type RouterContext } from './routes/__root';
import {
  API,
  AUTH,
  api,
  fakeToken,
  renderAt,
  renderRouter,
  renderSignedIn,
  sessionContext,
  setupAppTest,
  user,
} from './testing/app-harness';

vi.mock('./i18n/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./i18n/i18n')>();
  return { ...actual, activateLocale: vi.fn<typeof actual.activateLocale>(actual.activateLocale) };
});

const server = setupAppTest();

describe('app', () => {
  it('renders the home page at /', async () => {
    renderAt('/');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('Boilerplate web');
    expect(screen.getByRole('main')).toBeTruthy();
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
    const token = fakeToken({ exp: Math.floor(Date.now() / 1000) + 900 });
    server.use(
      http.get(`${AUTH}/token`, () => HttpResponse.json({ token })),
      http.get(`${API}/feature-flags`, ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({ flags: {} });
      }),
    );
    renderSignedIn('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Boilerplate web' })).toBeTruthy();
    expect(seen).toEqual([`Bearer ${token}`]);
  });
});
