import { expect, test } from '@playwright/test';

import { PASSWORD, linkFromEmail, uniqueEmail } from './support';

test('inscription, confirmation de l’email, puis création de l’organisation', async ({ page }) => {
  const email = uniqueEmail('signup');

  await page.goto('/commandes');
  await expect(page).toHaveURL('/connexion?redirect=%2Fcommandes');

  await page.getByRole('link', { name: 'Créer un compte' }).click();
  await expect(page).toHaveURL('/inscription?redirect=%2Fcommandes');
  await page.getByLabel('Nom').fill('Ada');
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(PASSWORD);
  await page.getByRole('button', { name: 'Créer mon compte' }).click();
  await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible();

  // Le lien ouvre la session puis ramène vers la page demandée ; sans organisation, l'app
  // demande d'en créer une.
  await page.goto(await linkFromEmail(email, 'Confirmez votre adresse email'));
  await expect(page.getByRole('heading', { name: 'Créer votre organisation' })).toBeVisible();

  await page.getByLabel("Nom de l'organisation").fill('Atelier Ada');
  await page.getByRole('button', { name: 'Créer' }).click();
  await expect(page.getByRole('heading', { name: 'Catalogue' })).toBeVisible();
  await expect(page.getByText('Aucun produit pour le moment')).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();
  await expect(page.getByText('Atelier Ada')).toBeVisible();
});

test('l’inscription ne révèle pas qu’une adresse a déjà un compte', async ({ page }) => {
  const email = uniqueEmail('twice');
  // Même réponse les deux fois : la page ne permet pas de deviner qui est inscrit.
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.goto('/inscription');
    await page.getByLabel('Nom').fill('Ada');
    await page.getByLabel('Adresse email').fill(email);
    await page.getByLabel('Mot de passe').fill(PASSWORD);
    await page.getByRole('button', { name: 'Créer mon compte' }).click();
    await expect(page.getByRole('heading', { name: 'Vérifiez votre boîte mail' })).toBeVisible();
  }
});
