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
  it('connecte l’utilisateur', async () => {
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

  it('signale les champs invalides sans appeler le service', async () => {
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

  it('affiche une erreur d’identifiants', async () => {
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

  it('propose de renvoyer le lien quand l’email n’est pas confirmé', async () => {
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

  it('signale le rate limiting', async () => {
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
