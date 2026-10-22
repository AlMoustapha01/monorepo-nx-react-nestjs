import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, linkFromEmail, signIn } from './support';

test('mot de passe oublié : lien par email, nouveau mot de passe, connexion', async ({ page }) => {
  const account = await createAccount('reset');
  await createOrganization(account, 'Boutique');

  await page.goto('/connexion');
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click();
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible();
  await page.getByLabel('Adresse email').fill(account.email);
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  await expect(page.getByText(/Si un compte existe pour cette adresse/)).toBeVisible();

  await page.goto(await linkFromEmail(account.email, 'Réinitialisez votre mot de passe'));
  await expect(page).toHaveURL(/\/reinitialiser-mot-de-passe\?token=/);
  await page.getByLabel('Nouveau mot de passe').fill('brand-new-password-42');
  await page.getByRole('button', { name: 'Enregistrer' }).click();

  await expect(
    page.getByText('Mot de passe modifié. Connectez-vous avec le nouveau.'),
  ).toBeVisible();
  await signIn(page, account.email, 'brand-new-password-42');
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
});

test('un lien de réinitialisation ne sert qu’une fois', async ({ page }) => {
  const account = await createAccount('reuse');
  await page.goto('/mot-de-passe-oublie');
  await page.getByLabel('Adresse email').fill(account.email);
  await page.getByRole('button', { name: 'Recevoir un lien' }).click();
  const link = await linkFromEmail(account.email, 'Réinitialisez votre mot de passe');

  await page.goto(link);
  await page.getByLabel('Nouveau mot de passe').fill('first-new-password-1');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();

  // Le service redirige un jeton déjà utilisé avec ?error=INVALID_TOKEN.
  await page.goto(link);
  await expect(page.getByRole('alert')).toHaveText(
    "Ce lien n'est plus valide. Demandez-en un nouveau.",
  );
});
