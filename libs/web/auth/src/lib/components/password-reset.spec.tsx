import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { AUTH, auth, betterAuthError, server } from '../../test-server';
import { renderWithProviders } from '../../test-utils';
import { ForgotPasswordPage } from './forgot-password-page';
import { ResetPasswordPage } from './reset-password-page';

describe('ForgotPasswordPage', () => {
  it('envoie la demande avec la page de réinitialisation, sans révéler si le compte existe', async () => {
    let body: unknown;
    server.use(
      http.post(`${AUTH}/request-password-reset`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: true });
      }),
    );
    await renderWithProviders(
      <ForgotPasswordPage auth={auth} resetPasswordUrl="http://localhost:4200/reset" />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Adresse email'), 'ada@shop.test');
    await user.click(screen.getByRole('button', { name: 'Recevoir un lien' }));
    expect(await screen.findByText(/Si un compte existe pour cette adresse/)).toBeTruthy();
    expect(body).toEqual({ email: 'ada@shop.test', redirectTo: 'http://localhost:4200/reset' });
  });
});

describe('ResetPasswordPage', () => {
  it('enregistre le nouveau mot de passe', async () => {
    let body: unknown;
    server.use(
      http.post(`${AUTH}/reset-password`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ status: true });
      }),
    );
    const onReset = vi.fn<() => void>();
    await renderWithProviders(<ResetPasswordPage auth={auth} token="tok" onReset={onReset} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'new-long-password');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await vi.waitFor(() => expect(onReset).toHaveBeenCalledOnce());
    expect(body).toEqual({ newPassword: 'new-long-password', token: 'tok' });
  });

  it('propose un nouveau lien quand le token est refusé ou absent', async () => {
    server.use(http.post(`${AUTH}/reset-password`, () => betterAuthError(400, 'INVALID_TOKEN')));
    await renderWithProviders(
      <ResetPasswordPage auth={auth} token="old" onReset={vi.fn<() => void>()} />,
    );
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Nouveau mot de passe'), 'new-long-password');
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect((await screen.findByRole('alert')).textContent).toContain("Ce lien n'est plus valide");
  });

  it('n’affiche pas le formulaire sans token', async () => {
    await renderWithProviders(
      <ResetPasswordPage auth={auth} token={undefined} onReset={vi.fn<() => void>()} />,
    );
    expect(screen.queryByLabelText('Nouveau mot de passe')).toBeNull();
    expect(screen.getByRole('link', { name: 'Recevoir un nouveau lien' })).toBeTruthy();
  });
});
