import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, signIn } from './support';

/** WCAG 2.1 A et AA, règles automatisables (axe ne remplace pas un audit manuel). */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

for (const path of ['/connexion', '/inscription', '/mot-de-passe-oublie']) {
  test(`${path} n’a pas de violation d’accessibilité détectable`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(violations).toEqual([]);
  });
}

test('un formulaire en erreur reste accessible', async ({ page }) => {
  await page.goto('/connexion');
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByLabel('Adresse email')).toHaveAttribute('aria-invalid', 'true');
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(violations).toEqual([]);
});

test('le catalogue et l’en-tête d’un utilisateur connecté sont accessibles', async ({ page }) => {
  const account = await createAccount('a11y');
  await createOrganization(account, 'Boutique');
  await page.goto('/connexion');
  await signIn(page, account.email);
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  const { violations } = await new AxeBuilder({ page }).withTags(WCAG).analyze();
  expect(violations).toEqual([]);
});
