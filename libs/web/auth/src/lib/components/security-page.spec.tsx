import { http, HttpResponse } from 'msw';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, fakeWebAuthn, server, session } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { SecurityPage } from './security-page';

const TOTP_URI = 'otpauth://totp/Shop:ada%40shop.test?secret=JBSWY3DPEHPK3PXP&issuer=Shop';

/** Session, organisation active et rôle, comme le service d'identité les renvoie. */
function account({
  twoFactorEnabled = false,
  requireTwoFactor = false,
  role = 'member',
  passkeySignIn = false,
}: {
  twoFactorEnabled?: boolean;
  requireTwoFactor?: boolean;
  role?: string;
  passkeySignIn?: boolean;
} = {}) {
  const state = { twoFactorEnabled, requireTwoFactor };
  server.use(
    http.get(`${AUTH}/get-session`, () =>
      HttpResponse.json({
        session: { ...session.session, passkeySignIn },
        user: { ...session.user, twoFactorEnabled: state.twoFactorEnabled },
      }),
    ),
    http.get(`${AUTH}/organization/list`, () =>
      HttpResponse.json([
        { id: 'o1', name: 'Atelier', slug: 'atelier', requireTwoFactor: state.requireTwoFactor },
      ]),
    ),
    http.get(`${AUTH}/organization/get-active-member-role`, () => HttpResponse.json({ role })),
  );
  return state;
}

async function render(onAccessChanged = vi.fn<() => void>()) {
  await renderWithProviders(<SecurityPage auth={auth} onAccessChanged={onAccessChanged} />);
  return { onAccessChanged, user: userEvent.setup() };
}

describe('SecurityPage', () => {
  it('sets up 2FA: password, QR code to scan, a first code, then the backup codes', async () => {
    const state = account();
    const calls: string[] = [];
    server.use(
      http.post(`${AUTH}/two-factor/enable`, async ({ request }) => {
        calls.push(`enable ${JSON.stringify(await request.json())}`);
        return HttpResponse.json({
          totpURI: TOTP_URI,
          backupCodes: ['aaaaa-11111', 'bbbbb-22222'],
        });
      }),
      http.post(`${AUTH}/two-factor/verify-totp`, async ({ request }) => {
        calls.push(`verify ${JSON.stringify(await request.json())}`);
        state.twoFactorEnabled = true;
        return HttpResponse.json({ token: 's', user: {} });
      }),
    );
    const { onAccessChanged, user } = await render();

    expect(await screen.findByText('Désactivée')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Activer' }));
    await user.type(screen.getByLabelText('Mot de passe'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(await screen.findByTitle('QR code à scanner')).toBeTruthy();
    // Clé à saisir à la main, pour une application sans appareil photo.
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    await user.type(screen.getByLabelText('Code de l’application d’authentification'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmer' }));

    const codes = await screen.findByRole('list', { name: 'Codes de secours' });
    expect(
      within(codes)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['aaaaa-11111', 'bbbbb-22222']);
    expect(onAccessChanged).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'J’ai noté mes codes' }));
    expect(await screen.findByText('Activée')).toBeTruthy();
    expect(calls).toEqual(['enable {"password":"secret-password"}', 'verify {"code":"123456"}']);
  });

  it('says when the password is wrong', async () => {
    account();
    server.use(
      http.post(`${AUTH}/two-factor/enable`, () => betterAuthError(400, 'INVALID_PASSWORD')),
    );
    const { user } = await render();

    await user.click(await screen.findByRole('button', { name: 'Activer' }));
    await user.type(screen.getByLabelText('Mot de passe'), 'wrong');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Mot de passe incorrect.')).toBeTruthy();
  });

  it('gives new backup codes, and turns 2FA off', async () => {
    const state = account({ twoFactorEnabled: true });
    server.use(
      http.post(`${AUTH}/two-factor/generate-backup-codes`, () =>
        HttpResponse.json({ status: true, backupCodes: ['ccccc-33333'] }),
      ),
      http.post(`${AUTH}/two-factor/disable`, () => {
        state.twoFactorEnabled = false;
        return HttpResponse.json({ status: true });
      }),
    );
    const { onAccessChanged, user } = await render();

    await user.click(await screen.findByRole('button', { name: 'Nouveaux codes de secours' }));
    await user.type(screen.getByLabelText('Mot de passe'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    const codes = await screen.findByRole('list', { name: 'Codes de secours' });
    expect(codes.textContent).toBe('ccccc-33333');
    await user.click(screen.getByRole('button', { name: 'J’ai noté mes codes' }));

    await user.click(await screen.findByRole('button', { name: 'Désactiver' }));
    await user.type(screen.getByLabelText('Mot de passe'), 'secret-password');
    await user.click(screen.getByRole('button', { name: 'Continuer' }));
    expect(await screen.findByText('Désactivée')).toBeTruthy();
    expect(onAccessChanged).toHaveBeenCalledOnce();
  });

  it('warns before turning 2FA off when the organization requires it', async () => {
    account({ twoFactorEnabled: true, requireTwoFactor: true });
    const { user } = await render();

    await user.click(await screen.findByRole('button', { name: 'Désactiver' }));
    expect(
      screen.getByText(
        'Atelier exige la vérification en deux étapes : sans elle, vous n’y aurez plus accès.',
      ),
    ).toBeTruthy();
  });

  it('asks a member of an organization that requires 2FA to turn it on', async () => {
    account({ requireTwoFactor: true });
    await render();

    expect(
      await screen.findByText(
        'Atelier exige la vérification en deux étapes. Activez-la pour retrouver l’accès.',
      ),
    ).toBeTruthy();
  });

  it('lets an owner with 2FA require it for every member', async () => {
    const state = account({ twoFactorEnabled: true, role: 'owner' });
    let update: unknown;
    server.use(
      http.post(`${AUTH}/organization/update`, async ({ request }) => {
        update = await request.json();
        state.requireTwoFactor = true;
        return HttpResponse.json({ id: 'o1', name: 'Atelier', slug: 'atelier' });
      }),
    );
    const { onAccessChanged, user } = await render();

    const required = await screen.findByRole('checkbox', {
      name: 'Exiger la vérification en deux étapes de tous les membres',
    });
    await user.click(required);
    await vi.waitFor(() =>
      expect(update).toEqual({ organizationId: 'o1', data: { requireTwoFactor: true } }),
    );
    await vi.waitFor(() => expect((required as HTMLInputElement).checked).toBe(true));
    expect(onAccessChanged).toHaveBeenCalledOnce();
  });

  it('keeps the requirement out of reach of an owner without 2FA', async () => {
    account({ role: 'owner' });
    await render();
    const required = await screen.findByRole('checkbox', {
      name: 'Exiger la vérification en deux étapes de tous les membres',
    });
    expect((required as HTMLInputElement).disabled).toBe(true);
    expect(
      screen.getByText('Activez d’abord la vérification en deux étapes sur votre compte.'),
    ).toBeTruthy();
  });

  it('shows no requirement setting to a plain member', async () => {
    account({ twoFactorEnabled: true });
    await render();
    expect(await screen.findByText('Activée')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
});

describe('SecurityPage passkeys', () => {
  it('adds a named passkey, lists it, then deletes it', async () => {
    account();
    const browser = fakeWebAuthn();
    let passkeys = [{ id: 'p1', name: 'iPhone', createdAt: '2026-11-01T10:00:00.000Z' }];
    const registered: unknown[] = [];
    server.use(
      http.get(`${AUTH}/passkey/list-user-passkeys`, () => HttpResponse.json(passkeys)),
      http.get(`${AUTH}/passkey/generate-register-options`, () =>
        HttpResponse.json({ challenge: 'r1' }),
      ),
      http.post(`${AUTH}/passkey/verify-registration`, async ({ request }) => {
        const body = (await request.json()) as { name: string };
        registered.push(body);
        passkeys = [
          ...passkeys,
          { id: 'p2', name: body.name, createdAt: '2026-11-17T10:00:00.000Z' },
        ];
        return HttpResponse.json({ id: 'p2' });
      }),
      http.post(`${AUTH}/passkey/delete-passkey`, async ({ request }) => {
        const { id } = (await request.json()) as { id: string };
        passkeys = passkeys.filter((passkey) => passkey.id !== id);
        return HttpResponse.json({ status: true });
      }),
    );
    await renderWithProviders(
      <SecurityPage auth={browser.auth} passkeys onAccessChanged={vi.fn<() => void>()} />,
    );
    const user = userEvent.setup();

    const list = await screen.findByRole('list', { name: 'Passkeys' });
    expect(within(list).getByText('iPhone')).toBeTruthy();
    await user.type(screen.getByLabelText('Nom de la passkey (facultatif)'), 'MacBook');
    await user.click(screen.getByRole('button', { name: 'Ajouter une passkey' }));
    expect(await within(list).findByText('MacBook')).toBeTruthy();
    expect(registered).toEqual([{ response: { id: 'credential' }, name: 'MacBook' }]);

    await user.click(screen.getByRole('button', { name: 'Supprimer la passkey iPhone' }));
    await vi.waitFor(() => expect(within(list).queryByText('iPhone')).toBeNull());
  });

  it('says when the browser cannot use passkeys', async () => {
    account();
    server.use(http.get(`${AUTH}/passkey/list-user-passkeys`, () => HttpResponse.json([])));
    await renderWithProviders(
      <SecurityPage auth={auth} passkeys onAccessChanged={vi.fn<() => void>()} />,
    );
    expect(
      await screen.findByText('Ce navigateur ne sait pas utiliser les passkeys.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ajouter une passkey' })).toBeNull();
  });

  it('has no passkeys section unless the app turns it on', async () => {
    account();
    await render();
    expect(await screen.findByText('Désactivée')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Passkeys' })).toBeNull();
  });

  it('lets in a member signed in with a passkey, and an owner require 2FA', async () => {
    account({ requireTwoFactor: false, role: 'owner', passkeySignIn: true });
    await render();
    const required = await screen.findByRole('checkbox', {
      name: 'Exiger la vérification en deux étapes de tous les membres',
    });
    expect((required as HTMLInputElement).disabled).toBe(false);
  });

  it('does not ask a member signed in with a passkey to turn 2FA on', async () => {
    account({ requireTwoFactor: true, passkeySignIn: true });
    await render();
    expect(await screen.findByText('Désactivée')).toBeTruthy();
    expect(screen.queryByText(/Activez-la pour retrouver l’accès/)).toBeNull();
  });
});
