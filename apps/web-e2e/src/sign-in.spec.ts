import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, publishProduct, signIn } from './support';

test('connexion : refus, retour à la page demandée, puis déconnexion', async ({ page }) => {
  const account = await createAccount('signin');
  await createOrganization(account, 'Boutique');

  await page.goto('/panier');
  await expect(page).toHaveURL('/connexion?redirect=%2Fpanier');

  await signIn(page, account.email, 'not-the-password');
  await expect(page.getByRole('alert')).toHaveText('Email ou mot de passe incorrect.');

  await signIn(page, account.email);
  await expect(page).toHaveURL('/panier');
  await expect(page.getByRole('heading', { name: 'Panier' })).toBeVisible();

  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion' })).toBeVisible();
  // La session est bien fermée : les pages de l'app redemandent une connexion.
  await page.goto('/');
  await expect(page).toHaveURL('/connexion?redirect=%2F');
});

test('la connexion ne redirige pas vers un autre site', async ({ page }) => {
  const account = await createAccount('redirect');
  await createOrganization(account, 'Boutique');

  await page.goto('/connexion?redirect=//evil.example/phishing');
  await signIn(page, account.email);
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
});

test('changer d’organisation change les données affichées', async ({ page }) => {
  const account = await createAccount('switch');
  // Chaque organisation créée devient active : le produit est publié dans celle-ci.
  await createOrganization(account, 'Atelier');
  await publishProduct(account, 'Tablier en lin');
  await createOrganization(account, 'Boutique');
  await publishProduct(account, 'Mug émaillé');

  // À la connexion, la première organisation de l'utilisateur est active.
  await page.goto('/connexion');
  await signIn(page, account.email);
  await expect(page.getByText('Tablier en lin')).toBeVisible();
  await expect(page.getByText('Mug émaillé')).toBeHidden();

  await page.getByRole('combobox', { name: 'Organisation' }).selectOption({ label: 'Boutique' });
  await expect(page.getByText('Mug émaillé')).toBeVisible();
  await expect(page.getByText('Tablier en lin')).toBeHidden();
});
