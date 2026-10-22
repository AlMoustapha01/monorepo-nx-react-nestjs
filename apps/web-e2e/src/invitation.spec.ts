import { expect, test } from '@playwright/test';

import {
  PASSWORD,
  createAccount,
  createOrganization,
  invite,
  linkFromEmail,
  uniqueEmail,
} from './support';

test('une personne invitée crée son compte et rejoint l’organisation', async ({ page }) => {
  const owner = await createAccount('owner');
  const organizationId = await createOrganization(owner, 'Boutique des Lilas');
  const email = uniqueEmail('invitee');
  await invite(owner, organizationId, email);

  // Sans compte : connexion demandée, puis inscription, en gardant l'invitation en destination.
  const invitation = await linkFromEmail(email, 'Invitation à rejoindre Boutique des Lilas');
  await page.goto(invitation);
  await expect(page).toHaveURL(/\/connexion\?redirect=%2Finvitations%2F/);
  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await page.getByLabel('Nom').fill('Invitée');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible();

  // La confirmation ramène sur l'invitation, session ouverte.
  await page.goto(await linkFromEmail(email, 'Confirmez votre adresse email'));
  await expect(page.getByRole('heading', { name: 'Rejoindre Boutique des Lilas' })).toBeVisible();
  await page.getByRole('button', { name: "Accepter l'invitation" }).click();

  await expect(page.getByRole('heading', { name: 'Accueil' })).toBeVisible();
  await expect(page.getByText('Boutique des Lilas')).toBeVisible();
});

test('une invitation adressée à quelqu’un d’autre est refusée', async ({ page }) => {
  const owner = await createAccount('owner');
  const organizationId = await createOrganization(owner, 'Boutique');
  const intended = uniqueEmail('intended');
  await invite(owner, organizationId, intended);
  const invitation = await linkFromEmail(intended, 'Invitation à rejoindre Boutique');

  const stranger = await createAccount('stranger');
  await page.goto(invitation);
  await page.getByLabel('Adresse email').fill(stranger.email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Cette invitation est destinée à une autre adresse email.',
  );
});
