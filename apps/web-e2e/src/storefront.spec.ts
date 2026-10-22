import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { publishProduct } from './storefront-support';
import { createAccount, createOrganization, signIn } from './support';

/** WCAG 2.1 A et AA, comme `accessibility.spec.ts`. */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

test('la connexion ramène au panier demandé', async ({ page }) => {
  const account = await createAccount('cart');
  await createOrganization(account, 'Boutique');

  await page.goto('/panier');
  await expect(page).toHaveURL('/connexion?redirect=%2Fpanier');
  await signIn(page, account.email);
  await expect(page).toHaveURL('/panier');
  await expect(page.getByRole('heading', { name: 'Panier' })).toBeVisible();
});

test('changer d’organisation change les données affichées', async ({ page }) => {
  const account = await createAccount('switch');
  // Chaque organisation créée devient active : le produit est publié dans celle-ci.
  await createOrganization(account, 'Atelier');
  await publishProduct(account, 'Tablier en lin');
  await createOrganization(account, 'Comptoir');
  await publishProduct(account, 'Mug émaillé');

  // À la connexion, la première organisation de l'utilisateur est active.
  await page.goto('/connexion?redirect=%2Fboutique');
  await signIn(page, account.email);
  await expect(page.getByText('Tablier en lin')).toBeVisible();
  await expect(page.getByText('Mug émaillé')).toBeHidden();

  // Le changement ramène à l'accueil.
  await page.getByRole('combobox', { name: 'Organisation' }).selectOption({ label: 'Comptoir' });
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await page.getByRole('link', { name: 'Boutique' }).click();
  await expect(page.getByText('Mug émaillé')).toBeVisible();
  await expect(page.getByText('Tablier en lin')).toBeHidden();
});

test('le catalogue et l’en-tête de la boutique sont accessibles', async ({ page }) => {
  const account = await createAccount('a11y');
  await createOrganization(account, 'Boutique');
  await page.goto('/connexion?redirect=%2Fboutique');
  await signIn(page, account.email);
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Panier (0)' })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(violations).toEqual([]);
});
