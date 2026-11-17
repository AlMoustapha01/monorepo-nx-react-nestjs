import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, fakeToken, renderSignedIn, setupAppTest, user } from './testing/app-harness';

const server = setupAppTest();

const BOB = { id: 'u2', name: 'Bob', email: 'bob@shop.test', emailVerified: true, role: 'user' };

/**
 * Service d'auth simulé : Ada est opératrice (`role: 'admin'`) ou non ; « Voir comme » ouvre la session de Bob,
 * que l'arrêt referme.
 */
function serveOperator({ operator = true } = {}) {
  const state = { impersonating: false };
  const exp = Math.floor(Date.now() / 1000) + 900;
  server.use(
    http.get(`${AUTH}/get-session`, () =>
      HttpResponse.json(
        state.impersonating
          ? { user: BOB, session: { activeOrganizationId: 'o1', impersonatedBy: user.id } }
          : {
              user: { ...user, role: operator ? 'admin' : 'user', twoFactorEnabled: true },
              session: { activeOrganizationId: 'o1' },
            },
      ),
    ),
    http.get(`${AUTH}/organization/list`, () =>
      HttpResponse.json([{ id: 'o1', name: 'Atelier', slug: 'atelier' }]),
    ),
    http.get(`${AUTH}/token`, () => HttpResponse.json({ token: fakeToken({ exp, tenant: 'o1' }) })),
    http.get(`${AUTH}/operator/search`, () =>
      HttpResponse.json({
        users: [{ ...BOB, organizations: [{ id: 'o1', name: 'Atelier', role: 'owner' }] }],
      }),
    ),
    http.post(`${AUTH}/admin/impersonate-user`, () => {
      state.impersonating = true;
      return HttpResponse.json({ session: {}, user: BOB });
    }),
    http.post(`${AUTH}/admin/stop-impersonating`, () => {
      state.impersonating = false;
      return HttpResponse.json({ session: {}, user });
    }),
  );
  return state;
}

describe('back-office', () => {
  it('links an operator to the back-office', async () => {
    serveOperator();
    renderSignedIn('/');

    const link = await screen.findByRole('link', { name: 'Back-office' });
    expect(link.getAttribute('href')).toBe('/support');
  });

  it('is a 404 page, with no link, for anyone else', async () => {
    serveOperator({ operator: false });
    renderSignedIn('/support');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
    expect(screen.queryByRole('link', { name: 'Back-office' })).toBeNull();
  });

  it('sees the app as a customer, under a banner, then comes back to the back-office', async () => {
    const state = serveOperator();
    const router = renderSignedIn('/support');
    const click = userEvent.setup();

    await click.type(await screen.findByLabelText('Email, nom ou organisation'), 'bob');
    await click.click(screen.getByRole('button', { name: 'Rechercher' }));
    await click.click(await screen.findByRole('button', { name: 'Voir comme bob@shop.test' }));

    const banner = await screen.findByRole('region', { name: 'Session du support' });
    expect(banner.textContent).toContain('bob@shop.test');
    expect(router.state.location.pathname).toBe('/');
    expect(state.impersonating).toBe(true);

    await click.click(within(banner).getByRole('button', { name: 'Revenir à mon compte' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Back-office' })).toBeTruthy();
    expect(router.state.location.pathname).toBe('/support');
    expect(screen.queryByRole('region', { name: 'Session du support' })).toBeNull();
  });
});
