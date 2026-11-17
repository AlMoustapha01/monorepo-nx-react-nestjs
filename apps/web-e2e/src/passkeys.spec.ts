import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';

import { createAccount, createOrganization, signIn } from './support';

/** Authentificateur de la plateforme simulé par Chromium : empreinte acceptée sans geste. */
async function virtualAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

/** Compte connecté par mot de passe, puis passkey ajoutée sur la page Sécurité. */
async function withPasskey(page: Page, name: string) {
  const account = await createAccount(name);
  await createOrganization(account, name);
  await virtualAuthenticator(page);
  await page.goto('/connexion');
  await signIn(page, account.email);
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await page.getByRole('link', { name: 'Sécurité' }).click();
  await page.getByLabel('Nom de la passkey (facultatif)').fill('Ordinateur');
  await page.getByRole('button', { name: 'Ajouter une passkey' }).click();
  await expect(page.getByRole('list', { name: 'Passkeys' }).getByText('Ordinateur')).toBeVisible();
  return account;
}

async function signInWithPasskey(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await page.getByRole('button', { name: 'Se connecter avec une passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
}

test('a user adds a passkey, then signs in with it, without a password', async ({ page }) => {
  await withPasskey(page, 'passkey-user');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);

  await signInWithPasskey(page);
});

test('a session opened with a passkey counts as the 2FA an organization requires', async ({
  page,
}) => {
  await withPasskey(page, 'passkey-owner');
  await signInWithPasskey(page);

  // Sans application d'authentification : la session ouverte par passkey suffit pour l'exiger, et garder l'accès.
  await page.goto('/securite');
  const required = page.getByLabel('Exiger la vérification en deux étapes de tous les membres');
  await required.click();
  await expect(required).toBeChecked();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});
