import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, server } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { SignUpPage } from './sign-up-page';

async function fill(password = 'long-enough-password') {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Nom'), 'Ada');
  await user.type(screen.getByLabelText('Adresse email'), 'ada@shop.test');
  await user.type(screen.getByLabelText('Mot de passe'), password);
  await user.click(screen.getByRole('button', { name: 'Créer mon compte' }));
}

describe('SignUpPage', () => {
  it('crée le compte et demande de confirmer l’email', async () => {
    let body: unknown;
    server.use(
      http.post(`${AUTH}/sign-up/email`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ token: null, user: {} });
      }),
    );
    await renderWithProviders(
      <SignUpPage auth={auth} verificationCallbackUrl="http://localhost:4200/" />,
    );
    await fill();
    expect(await screen.findByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeTruthy();
    expect(screen.getByText(/ada@shop\.test/)).toBeTruthy();
    expect(body).toEqual({
      name: 'Ada',
      email: 'ada@shop.test',
      password: 'long-enough-password',
      callbackURL: 'http://localhost:4200/',
    });
  });

  it('refuse un mot de passe trop court', async () => {
    await renderWithProviders(<SignUpPage auth={auth} verificationCallbackUrl="/" />);
    await fill('short');
    expect(await screen.findByText('Entre 8 et 128 caractères.')).toBeTruthy();
  });

  it('répond pareil quand l’adresse a déjà un compte, comme le service', async () => {
    // Avec la vérification d'email obligatoire, Better Auth ne révèle pas qu'un compte existe :
    // même réponse qu'une inscription (vérifié contre le vrai service par apps/web-e2e).
    server.use(
      http.post(`${AUTH}/sign-up/email`, () => HttpResponse.json({ token: null, user: {} })),
    );
    await renderWithProviders(<SignUpPage auth={auth} verificationCallbackUrl="/" />);
    await fill();
    expect(await screen.findByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeTruthy();
  });

  it('signale un compte existant si le service le révèle (sans vérification d’email)', async () => {
    server.use(
      http.post(`${AUTH}/sign-up/email`, () => betterAuthError(422, 'USER_ALREADY_EXISTS')),
    );
    await renderWithProviders(<SignUpPage auth={auth} verificationCallbackUrl="/" />);
    await fill();
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Un compte existe déjà avec cette adresse email.',
    );
  });
});
