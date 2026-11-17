import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, signIn, totp, turnOnTwoFactor } from './support';

test('a user turns on 2FA, then signs in with the code of the authenticator app', async ({
  page,
}) => {
  const account = await createAccount('2fa-user');
  await createOrganization(account, 'Atelier');
  await page.goto('/connexion');
  await signIn(page, account.email);
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await page.getByRole('link', { name: 'Sécurité' }).click();

  await expect(page.getByRole('heading', { name: 'Sécurité du compte' })).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);
  const secret = await turnOnTwoFactor(page);

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await signIn(page, account.email);
  await page.getByLabel('Code de l’application d’authentification').fill(totp(secret));
  await page.getByRole('button', { name: 'Vérifier' }).click();
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
});

test('an organization that requires 2FA sends a member without it to the security page', async ({
  page,
}) => {
  const owner = await createAccount('2fa-required-owner');
  const organizationId = await createOrganization(owner, 'Comptoir');
  await page.goto('/connexion');
  await signIn(page, owner.email);
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await page.goto('/securite');
  await turnOnTwoFactor(page);
  // Contrôlée par le serveur : cochée une fois l'exigence enregistrée.
  await page.getByLabel('Exiger la vérification en deux étapes de tous les membres').click();
  await expect(
    page.getByLabel('Exiger la vérification en deux étapes de tous les membres'),
  ).toBeChecked();

  // Un membre sans 2FA : renvoyé vers la page de sécurité, puis l'accès revient avec la 2FA.
  const member = await createAccount('2fa-required-member');
  const invitation = (await (
    await owner.auth.post('organization/invite-member', {
      data: { email: member.email, role: 'member', organizationId },
    })
  ).json()) as { id: string };
  await member.auth.post('organization/accept-invitation', {
    data: { invitationId: invitation.id },
  });
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await signIn(page, member.email);

  await expect(
    page.getByText(
      'Comptoir exige la vérification en deux étapes. Activez-la pour retrouver l’accès.',
    ),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/securite$/);
  await turnOnTwoFactor(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
});
