import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import {
  createAccount,
  createOrganization,
  grantOperator,
  signIn,
  turnOnTwoFactor,
} from './support';

test('an operator turns a feature off for one organization only, from the back-office', async ({
  page,
}) => {
  const customer = await createAccount('flags-customer');
  await createOrganization(customer, 'Atelier pilote');
  const operator = await createAccount('flags-operator');
  await grantOperator(operator.email);

  await page.goto('/connexion');
  await signIn(page, operator.email);
  await expect(page.getByRole('heading', { level: 1, name: 'Back-office' })).toBeVisible();
  await page.getByRole('link', { name: 'Sécurité' }).click();
  await turnOnTwoFactor(page);
  await page.getByRole('link', { name: 'Back-office' }).click();

  await page.getByLabel('Email, nom ou organisation').fill(customer.email);
  await page.getByRole('button', { name: 'Rechercher' }).click();
  await page.getByRole('button', { name: 'Flags de Atelier pilote' }).click();
  const panel = page.getByRole('region', { name: 'Flags de Atelier pilote' });
  // Activé pour tous dans la stack e2e : coupé pour cette organisation seulement.
  const auditLog = panel.getByLabel('Valeur de audit.log');
  await expect(auditLog).toHaveValue('default');
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);
  await auditLog.selectOption('off');
  await expect(auditLog).toHaveValue('off');

  // Vu comme le client : l'API applique la surcharge, le journal d'audit n'est plus là.
  await page.getByRole('button', { name: `Voir comme ${customer.email}` }).click();
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sécurité' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Journal d’audit' })).toBeHidden();
});
