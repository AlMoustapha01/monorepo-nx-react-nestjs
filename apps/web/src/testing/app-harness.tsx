import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, vi } from 'vitest';
import {
  createAccessTokenSource,
  createApiClient,
  createAuthClient,
  createQueryClient,
} from '@nx-react-nestjs/web-data-access';

import { activateLocale } from '../i18n/i18n';
import { createAppRouter } from '../router';
import type { SessionContext } from '../session';

/** Banc d'essai de l'app entière (routeur, layout, i18n) contre une API simulée par MSW. */

export const API = 'http://localhost:3000/api/v1';
export const AUTH = 'http://localhost:3100/api/auth';
export const api = createApiClient({ baseUrl: API });
const auth = createAuthClient({ baseUrl: 'http://localhost:3100' });

export function sessionContext(devMode: boolean): SessionContext {
  return { auth, tokens: createAccessTokenSource(() => auth.getAccessToken()), devMode };
}

/** Token factice lisible par les handlers MSW (charge utile en base64, sans signature). */
export function fakeToken(payload: Record<string, unknown>): string {
  return `h.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.s`;
}

/** Serveur MSW (flags tous coupés par défaut), locale `fr` et stockage vide avant chaque test. */
export function setupAppTest() {
  const server = setupServer(
    http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: {} })),
  );
  beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());
  beforeEach(async () => {
    localStorage.clear();
    await activateLocale('fr');
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });
  return server;
}

export function renderRouter(
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
export function renderAt(url: string, { devMode = true } = {}) {
  const queryClient = createQueryClient();
  const router = createAppRouter(
    { queryClient, api, session: sessionContext(devMode) },
    createMemoryHistory({ initialEntries: [url] }),
  );
  renderRouter(router, queryClient);
  return router;
}

/**
 * Comme `main.tsx` avec le service d'auth : l'API reçoit le token de la session (pas de devMode).
 * `url` : page de départ.
 */
export function renderSignedIn(url: string) {
  const queryClient = createQueryClient();
  const session = sessionContext(false);
  const router = createAppRouter(
    {
      queryClient,
      api: createApiClient({ baseUrl: API, getToken: session.tokens.getToken }),
      session,
    },
    createMemoryHistory({ initialEntries: [url] }),
  );
  renderRouter(router, queryClient);
  return router;
}

export const user = { id: 'u1', name: 'Ada', email: 'ada@shop.test', emailVerified: true };

/**
 * Service d'auth simulé : `user` est connecté, organisation active « Atelier » (`o1`), et peut
 * passer à « Comptoir » (`o2`). Le token porte le tenant actif (`tenant`), comme le vrai.
 */
export function serveTwoOrganizations(server: ReturnType<typeof setupServer>) {
  let active = 'o1';
  const exp = Math.floor(Date.now() / 1000) + 900;
  server.use(
    http.get(`${AUTH}/get-session`, () =>
      HttpResponse.json({ user, session: { activeOrganizationId: active } }),
    ),
    http.get(`${AUTH}/organization/list`, () =>
      HttpResponse.json([
        { id: 'o1', name: 'Atelier', slug: 'atelier' },
        { id: 'o2', name: 'Comptoir', slug: 'comptoir' },
      ]),
    ),
    http.post(`${AUTH}/organization/set-active`, async ({ request }) => {
      ({ organizationId: active } = (await request.json()) as { organizationId: string });
      return HttpResponse.json({});
    }),
    http.get(`${AUTH}/token`, () =>
      HttpResponse.json({ token: fakeToken({ exp, tenant: active }) }),
    ),
  );
}
