import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';

import { API, AUTH, fakeToken, renderSignedIn, setupAppTest, user } from './testing/app-harness';

const server = setupAppTest();

/** Service d'auth simulé : organisation active « Atelier », qui exige ou non la 2FA. */
function serveAccount({ requireTwoFactor = false, twoFactorEnabled = false } = {}) {
  const exp = Math.floor(Date.now() / 1000) + 900;
  // Comme le vrai service : sans la 2FA exigée, le token n'a pas de tenant.
  const tenant = requireTwoFactor && !twoFactorEnabled ? undefined : 'o1';
  server.use(
    http.get(`${AUTH}/get-session`, () =>
      HttpResponse.json({
        user: { ...user, twoFactorEnabled },
        session: { activeOrganizationId: 'o1' },
      }),
    ),
    http.get(`${AUTH}/organization/list`, () =>
      HttpResponse.json([{ id: 'o1', name: 'Atelier', slug: 'atelier', requireTwoFactor }]),
    ),
    http.get(`${AUTH}/organization/get-active-member-role`, () =>
      HttpResponse.json({ role: 'member' }),
    ),
    http.get(`${AUTH}/token`, () => HttpResponse.json({ token: fakeToken({ exp, tenant }) })),
  );
}

describe('two-factor authentication', () => {
  // option:feature-flags:start
  const twoFactorOn = () =>
    http.get(`${API}/feature-flags`, () =>
      HttpResponse.json({ flags: { 'account.two-factor': true } }),
    );
  // option:feature-flags:end

  it('links to the security page of the account', async () => {
    serveAccount();
    // option:feature-flags:start
    server.use(twoFactorOn());
    // option:feature-flags:end
    renderSignedIn('/securite');

    expect(await screen.findByRole('heading', { name: 'Sécurité du compte' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Sécurité' }).getAttribute('href')).toBe('/securite');
  });

  // option:feature-flags:start
  it('is absent while account.two-factor is off: no link, and a 404 page', async () => {
    serveAccount();
    renderSignedIn('/securite');

    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
    expect(screen.queryByRole('link', { name: 'Sécurité' })).toBeNull();
  });
  // option:feature-flags:end

  it('sends a member without 2FA to the security page when the organization requires it', async () => {
    serveAccount({ requireTwoFactor: true });
    let apiCalls = 0;
    server.use(
      http.all(`${API}/*`, () => {
        apiCalls += 1;
        return HttpResponse.json({}, { status: 401 });
      }),
    );
    const router = renderSignedIn('/');

    expect(
      await screen.findByText(
        'Atelier exige la vérification en deux étapes. Activez-la pour retrouver l’accès.',
      ),
    ).toBeTruthy();
    expect(router.state.location.pathname).toBe('/securite');
    // Sans tenant dans son token, l'API refuserait tout : elle n'est pas appelée.
    expect(apiCalls).toBe(0);
  });
});
