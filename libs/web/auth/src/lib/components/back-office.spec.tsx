import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, server, session } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { BackOfficePage } from './back-office-page';
import { ImpersonationBanner } from './impersonation-banner';

const BOB = {
  id: 'u2',
  email: 'bob@shop.test',
  name: 'Bob',
  organizations: [
    { id: 'o1', name: 'Atelier', role: 'owner' },
    { id: 'o2', name: 'Boutique', role: 'member' },
  ],
};

describe('BackOfficePage', () => {
  it('finds an account by email, name or organization, then sees the app as its user', async () => {
    const calls: string[] = [];
    server.use(
      http.get(`${AUTH}/operator/search`, ({ request }) => {
        calls.push(`search ${new URL(request.url).searchParams.get('query')}`);
        return HttpResponse.json({ users: [BOB] });
      }),
      http.post(`${AUTH}/admin/impersonate-user`, async ({ request }) => {
        calls.push(`impersonate ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({ session: {}, user: {} });
      }),
    );
    const onImpersonated = vi.fn<() => void>();
    await renderWithProviders(<BackOfficePage auth={auth} onImpersonated={onImpersonated} />);
    const user = userEvent.setup();

    expect(screen.getByRole('heading', { level: 1, name: 'Back-office' })).toBeTruthy();
    await user.type(screen.getByLabelText('Email, nom ou organisation'), 'atelier');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));

    const results = await screen.findByRole('list', { name: 'Comptes trouvés' });
    const [bob] = within(results).getAllByRole('listitem');
    expect(bob?.textContent).toContain('bob@shop.test');
    expect(bob?.textContent).toContain('Atelier (owner)');
    expect(bob?.textContent).toContain('Boutique (member)');
    await user.click(within(results).getByRole('button', { name: 'Voir comme bob@shop.test' }));

    await vi.waitFor(() => expect(onImpersonated).toHaveBeenCalledOnce());
    expect(calls).toEqual(['search atelier', 'impersonate {"userId":"u2"}']);
  });

  it('says when nothing matches, and asks for two characters at least', async () => {
    server.use(http.get(`${AUTH}/operator/search`, () => HttpResponse.json({ users: [] })));
    await renderWithProviders(<BackOfficePage auth={auth} onImpersonated={vi.fn<() => void>()} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email, nom ou organisation'), 'a');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByText('Saisissez au moins 2 caractères.')).toBeTruthy();

    await user.type(screen.getByLabelText('Email, nom ou organisation'), 'zz');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    expect(await screen.findByText('Aucun compte ne correspond.')).toBeTruthy();
  });

  it('asks an operator without 2FA to turn it on before seeing an account', async () => {
    server.use(
      http.get(`${AUTH}/operator/search`, () => HttpResponse.json({ users: [BOB] })),
      http.post(`${AUTH}/admin/impersonate-user`, () =>
        betterAuthError(403, 'OPERATOR_TWO_FACTOR_REQUIRED'),
      ),
    );
    const onImpersonated = vi.fn<() => void>();
    await renderWithProviders(<BackOfficePage auth={auth} onImpersonated={onImpersonated} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Email, nom ou organisation'), 'bob');
    await user.click(screen.getByRole('button', { name: 'Rechercher' }));
    await user.click(await screen.findByRole('button', { name: 'Voir comme bob@shop.test' }));

    expect(
      await screen.findByText(
        'Activez la vérification en deux étapes sur votre compte avant de voir celui d’un client.',
      ),
    ).toBeTruthy();
    expect(onImpersonated).not.toHaveBeenCalled();
  });
});

describe('ImpersonationBanner', () => {
  const impersonated = {
    user: { ...session.user, email: 'bob@shop.test' },
    session: { ...session.session, impersonatedBy: 'u1' },
  };

  it('tells the operator whose account it sees, and brings it back to its own', async () => {
    let stopped = false;
    server.use(
      http.post(`${AUTH}/admin/stop-impersonating`, () => {
        stopped = true;
        return HttpResponse.json({ session: {}, user: {} });
      }),
    );
    const onStopped = vi.fn<() => void>();
    await renderWithProviders(
      <ImpersonationBanner auth={auth} session={impersonated} onStopped={onStopped} />,
    );

    const banner = screen.getByRole('region', { name: 'Session du support' });
    expect(banner.textContent).toContain('Vous voyez l’application comme bob@shop.test');
    await userEvent.click(within(banner).getByRole('button', { name: 'Revenir à mon compte' }));
    await vi.waitFor(() => expect(onStopped).toHaveBeenCalledOnce());
    expect(stopped).toBe(true);
  });

  it('shows nothing outside an impersonation', async () => {
    await renderWithProviders(
      <ImpersonationBanner auth={auth} session={session} onStopped={vi.fn<() => void>()} />,
    );
    expect(screen.queryByRole('region', { name: 'Session du support' })).toBeNull();
  });
});
