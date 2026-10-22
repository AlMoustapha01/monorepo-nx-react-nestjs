import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, signIn } from './support';

test('connexion : refus, retour à la page demandée, puis déconnexion', async ({ page }) => {
  const account = await createAccount('signin');
  await createOrganization(account, 'Boutique');

  await page.goto('/?onglet=2');
  await expect(page).toHaveURL('/connexion?redirect=%2F%3Fonglet%3D2');

  await signIn(page, account.email, 'not-the-password');
  await expect(page.getByRole('alert')).toHaveText('Email ou mot de passe incorrect.');

  await signIn(page, account.email);
  await expect(page).toHaveURL('/?onglet=2');
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();

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
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
});

test('l’organisation choisie reste active après un rechargement', async ({ page }) => {
  const account = await createAccount('switch');
  await createOrganization(account, 'Atelier');
  await createOrganization(account, 'Comptoir');

  // À la connexion, la première organisation de l'utilisateur est active.
  await page.goto('/connexion');
  await signIn(page, account.email);
  const organization = page.getByRole('combobox', { name: 'Organisation' });
  await expect(organization.locator('option:checked')).toHaveText('Atelier');

  await organization.selectOption({ label: 'Comptoir' });
  await expect(page).toHaveURL('/');
  await expect(organization.locator('option:checked')).toHaveText('Comptoir');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await expect(organization.locator('option:checked')).toHaveText('Comptoir');
});
