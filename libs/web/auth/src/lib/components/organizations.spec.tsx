import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, server, session } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { AcceptInvitationPage } from './accept-invitation-page';
import { AccountMenu } from './account-menu';
import { CreateOrganizationPage } from './create-organization-page';

const invitation = {
  id: 'i1',
  email: 'ada@shop.test',
  role: 'member',
  status: 'pending',
  organizationId: 'o2',
  organizationName: 'Boutique',
};

describe('CreateOrganizationPage', () => {
  it('crée l’organisation', async () => {
    server.use(
      http.post(`${AUTH}/organization/create`, () =>
        HttpResponse.json({ id: 'o1', name: 'Boutique', slug: 'boutique-abc123' }),
      ),
    );
    const onCreated = vi.fn<() => void>();
    await renderWithProviders(<CreateOrganizationPage auth={auth} onCreated={onCreated} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nom de l'organisation"), 'Boutique');
    await user.click(screen.getByRole('button', { name: 'Créer' }));
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });
});

describe('AcceptInvitationPage', () => {
  it('affiche l’organisation et accepte l’invitation', async () => {
    let accepted: unknown;
    server.use(
      http.get(`${AUTH}/organization/get-invitation`, () => HttpResponse.json(invitation)),
      http.post(`${AUTH}/organization/accept-invitation`, async ({ request }) => {
        accepted = await request.json();
        return HttpResponse.json({});
      }),
    );
    const onAccepted = vi.fn<() => void>();
    await renderWithProviders(
      <AcceptInvitationPage auth={auth} invitationId="i1" onAccepted={onAccepted} />,
    );
    expect(await screen.findByRole('heading', { name: 'Rejoindre Boutique' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: "Accepter l'invitation" }));
    await vi.waitFor(() => expect(onAccepted).toHaveBeenCalledOnce());
    expect(accepted).toEqual({ invitationId: 'i1' });
  });

  it('explique une invitation destinée à une autre adresse', async () => {
    server.use(
      http.get(`${AUTH}/organization/get-invitation`, () =>
        betterAuthError(403, 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION'),
      ),
    );
    await renderWithProviders(
      <AcceptInvitationPage auth={auth} invitationId="i1" onAccepted={vi.fn<() => void>()} />,
    );
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Cette invitation est destinée à une autre adresse email.',
    );
  });
});

describe('AccountMenu', () => {
  const organizations = [
    { id: 'o1', name: 'Boutique', slug: 'boutique' },
    { id: 'o2', name: 'Atelier', slug: 'atelier' },
  ];

  it('change d’organisation', async () => {
    let activated: unknown;
    server.use(
      http.get(`${AUTH}/organization/list`, () => HttpResponse.json(organizations)),
      http.post(`${AUTH}/organization/set-active`, async ({ request }) => {
        activated = await request.json();
        return HttpResponse.json({});
      }),
    );
    const onOrganizationChanged = vi.fn<() => void>();
    await renderWithProviders(
      <AccountMenu
        auth={auth}
        session={session}
        onOrganizationChanged={onOrganizationChanged}
        onSignedOut={vi.fn<() => void>()}
        onError={vi.fn<() => void>()}
      />,
    );
    const select = await screen.findByRole('combobox', { name: 'Organisation' });
    await userEvent.setup().selectOptions(select, 'Atelier');
    await vi.waitFor(() => expect(onOrganizationChanged).toHaveBeenCalledOnce());
    expect(activated).toEqual({ organizationId: 'o2' });
  });

  it('affiche l’organisation seule sans sélecteur, et déconnecte', async () => {
    server.use(
      http.get(`${AUTH}/organization/list`, () => HttpResponse.json([organizations[0]])),
      http.post(`${AUTH}/sign-out`, () => HttpResponse.json({ success: true })),
    );
    const onSignedOut = vi.fn<() => void>();
    await renderWithProviders(
      <AccountMenu
        auth={auth}
        session={session}
        onOrganizationChanged={vi.fn<() => void>()}
        onSignedOut={onSignedOut}
        onError={vi.fn<() => void>()}
      />,
    );
    expect(await screen.findByText('Boutique')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Se déconnecter' }));
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
  });
});
