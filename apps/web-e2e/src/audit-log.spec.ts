import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

import { createAccount, createOrganization, invite, signIn, uniqueEmail } from './support';

/** Le service d'identité écrit dans le journal de l'API ; le staff le lit dans l'app. */
test('the staff finds its sign-in and its invitation in the audit log', async ({ page }) => {
  const owner = await createAccount('audit-owner');
  const organizationId = await createOrganization(owner, 'Atelier');
  await invite(owner, organizationId, uniqueEmail('audit-guest'));

  await page.goto('/connexion');
  await signIn(page, owner.email);
  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await page.getByRole('link', { name: 'Journal d’audit' }).click();

  const log = page.getByRole('list', { name: 'Journal d’audit' });
  // Une seule connexion : créer l'organisation, rafraîchir le token ou la session n'en sont pas.
  await expect(log.getByRole('listitem').filter({ hasText: 'Connexion au compte' })).toHaveCount(1);
  const invitation = log.getByRole('listitem').filter({ hasText: 'Membre invité' });
  await expect(invitation).toContainText('role : member');
  await expect(invitation.getByRole('button', { name: 'audit-owner' })).toBeVisible();
  // Jamais d'email dans le journal : l'invité n'y est qu'une invitation.
  await expect(log).not.toContainText('audit-guest');

  await page.getByLabel('Action').selectOption({ label: 'Membre invité' });
  await expect(log.getByRole('listitem')).toHaveCount(1);

  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  expect(violations).toEqual([]);
});
