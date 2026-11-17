import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, server } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { SignInPage } from './sign-in-page';

const callback = 'http://localhost:4200/';

async function fill(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Adresse email'), email);
  await user.type(screen.getByLabelText('Mot de passe'), password);
  await user.click(screen.getByRole('button', { name: 'Se connecter' }));
  return user;
}

describe('SignInPage', () => {
  it('signs the user in', async () => {
    let body: unknown;
    server.use(
      http.post(`${AUTH}/sign-in/email`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ redirect: false, token: 's', user: {} });
      }),
    );
    const onSignedIn = vi.fn<() => void>();
    await renderWithProviders(
      <SignInPage auth={auth} verificationCallbackUrl={callback} onSignedIn={onSignedIn} />,
    );
    await fill(' Ada@Shop.test ', 'secret-password');
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(body).toEqual({ email: 'ada@shop.test', password: 'secret-password' });
  });

  it('flags invalid fields without calling the service', async () => {
    await renderWithProviders(
      <SignInPage
        auth={auth}
        verificationCallbackUrl={callback}
        onSignedIn={vi.fn<() => void>()}
      />,
    );
    await fill('pas-un-email', 'x');
    expect(await screen.findByText('Saisissez une adresse email valide.')).toBeTruthy();
    expect(screen.getByLabelText('Adresse email').getAttribute('aria-invalid')).toBe('true');
  });

  it('shows an invalid credentials error', async () => {
    server.use(
      http.post(`${AUTH}/sign-in/email`, () => betterAuthError(401, 'INVALID_EMAIL_OR_PASSWORD')),
    );
    await renderWithProviders(
      <SignInPage
        auth={auth}
        verificationCallbackUrl={callback}
        onSignedIn={vi.fn<() => void>()}
      />,
    );
    await fill('ada@shop.test', 'wrong');
    expect((await screen.findByRole('alert')).textContent).toBe('Email ou mot de passe incorrect.');
  });

  it('offers to resend the link when the email is not confirmed', async () => {
    let resent: unknown;
    server.use(
      http.post(`${AUTH}/sign-in/email`, () => betterAuthError(403, 'EMAIL_NOT_VERIFIED')),
      http.post(`${AUTH}/send-verification-email`, async ({ request }) => {
        resent = await request.json();
        return HttpResponse.json({ status: true });
      }),
    );
    await renderWithProviders(
      <SignInPage
        auth={auth}
        verificationCallbackUrl={callback}
        onSignedIn={vi.fn<() => void>()}
      />,
    );
    const user = await fill('ada@shop.test', 'secret-password');
    await user.click(
      await screen.findByRole('button', { name: 'Renvoyer le lien de confirmation' }),
    );
    expect(await screen.findByText('Un nouveau lien de confirmation a été envoyé.')).toBeTruthy();
    expect(resent).toEqual({ email: 'ada@shop.test', callbackURL: callback });
  });

  it('reports rate limiting', async () => {
    server.use(http.post(`${AUTH}/sign-in/email`, () => new HttpResponse(null, { status: 429 })));
    await renderWithProviders(
      <SignInPage
        auth={auth}
        verificationCallbackUrl={callback}
        onSignedIn={vi.fn<() => void>()}
      />,
    );
    await fill('ada@shop.test', 'secret-password');
    expect((await screen.findByRole('alert')).textContent).toContain('Trop de tentatives');
  });
});

describe('SignInPage with two-factor authentication', () => {
  const secondFactorDue = () =>
    http.post(`${AUTH}/sign-in/email`, () => HttpResponse.json({ twoFactorRedirect: true }));

  async function render() {
    const onSignedIn = vi.fn<() => void>();
    await renderWithProviders(
      <SignInPage auth={auth} verificationCallbackUrl={callback} onSignedIn={onSignedIn} />,
    );
    return onSignedIn;
  }

  it('asks for the code of the authenticator app after the password', async () => {
    let code: unknown;
    server.use(
      secondFactorDue(),
      http.post(`${AUTH}/two-factor/verify-totp`, async ({ request }) => {
        code = await request.json();
        return HttpResponse.json({ token: 's', user: {} });
      }),
    );
    const onSignedIn = await render();
    const user = await fill('ada@shop.test', 'secret-password');

    const field = await screen.findByLabelText('Code de l’application d’authentification');
    expect(onSignedIn).not.toHaveBeenCalled();
    await user.type(field, ' 123456 ');
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(code).toEqual({ code: '123456' });
  });

  it('accepts a backup code instead, and says when a code is wrong', async () => {
    let backup: unknown;
    server.use(
      secondFactorDue(),
      http.post(`${AUTH}/two-factor/verify-totp`, () => betterAuthError(401, 'INVALID_CODE')),
      http.post(`${AUTH}/two-factor/verify-backup-code`, async ({ request }) => {
        backup = await request.json();
        return HttpResponse.json({ token: 's', user: {} });
      }),
    );
    const onSignedIn = await render();
    const user = await fill('ada@shop.test', 'secret-password');

    await user.type(
      await screen.findByLabelText('Code de l’application d’authentification'),
      '000000',
    );
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));
    expect(await screen.findByText('Code incorrect. Réessayez.')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Utiliser un code de secours' }));
    await user.type(screen.getByLabelText('Code de secours'), 'abcde-12345');
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));
    await vi.waitFor(() => expect(onSignedIn).toHaveBeenCalledOnce());
    expect(backup).toEqual({ code: 'abcde-12345' });
  });

  it('starts over when the second step has expired', async () => {
    server.use(
      secondFactorDue(),
      http.post(`${AUTH}/two-factor/verify-totp`, () =>
        betterAuthError(401, 'INVALID_TWO_FACTOR_COOKIE'),
      ),
    );
    await render();
    const user = await fill('ada@shop.test', 'secret-password');

    await user.type(
      await screen.findByLabelText('Code de l’application d’authentification'),
      '123456',
    );
    await user.click(screen.getByRole('button', { name: 'Vérifier' }));
    expect(
      await screen.findByText('La vérification a expiré. Saisissez à nouveau votre mot de passe.'),
    ).toBeTruthy();
    expect(screen.getByLabelText('Mot de passe')).toBeTruthy();
  });
});
