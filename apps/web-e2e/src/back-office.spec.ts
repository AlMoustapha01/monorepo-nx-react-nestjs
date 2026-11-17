import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createAccount,
  createOrganization,
  grantOperator,
  signIn,
  turnOnTwoFactor,
} from './support';

test('an operator with 2FA sees the app as a customer, who finds it in the audit log', async ({
  page,
}) => {
  const customer = await createAccount('bo-customer');
  await createOrganization(customer, 'Atelier du client');
  // Opérateur membre d'aucune organisation : il arrive sur le back-office, et active sa 2FA d'abord.
  const operator = await createAccount('bo-operator');
  await grantOperator(operator.email);

  await page.goto('/connexion');
  await signIn(page, operator.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Back-office' })).toBeVisible();
  await page.getByRole('link', { name: 'Sécurité' }).click();
  await turnOnTwoFactor(page);

  await page.getByRole('link', { name: 'Back-office' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Back-office' })).toBeVisible();
  await page.getByLabel('Email, nom ou organisation').fill(customer.email);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  const results = page.getByRole('list', { name: 'Comptes trouvés' });
  await expect(results.getByText('Atelier du client (owner)')).toBeVisible();
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);
  await results.getByRole('button', { name: `Voir comme ${customer.email}` }).click();

  const banner = page.getByRole('region', { name: 'Session du support' });
  await expect(banner).toContainText(`Vous voyez l’application comme ${customer.email}`);
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  // Le client, staff de son organisation, voit l'entrée du support dans son journal.
  await page.getByRole('link', { name: 'Journal d’audit' }).click();
  const log = page.getByRole('list', { name: 'Journal d’audit' });
  await expect(log.getByText('Le support est entré dans le compte')).toBeVisible();
  await expect(log.getByText('Support de la plateforme')).toBeVisible();

  await banner.getByRole('button', { name: 'Revenir à mon compte' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Back-office' })).toBeVisible();
  await expect(banner).toBeHidden();
});
