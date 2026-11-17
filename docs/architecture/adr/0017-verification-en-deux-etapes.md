# 0017. Vérification en deux étapes par application d'authentification, exigible par organisation

- **Statut** : Acceptée
- **Date** : 2026-11-17

## Contexte

Un compte ne tient qu'à son mot de passe. Les clients B2B demandent un second facteur, et le pouvoir de l'imposer à tous les membres de leur organisation. Les passkeys suivront dans une décision à part (montée de Better Auth et dépendance WebAuthn).

## Décision

- **Plugin `twoFactor` de Better Auth**, dans `apps/auth` : application d'authentification (TOTP, 6 chiffres, 30 s) et 10 codes de secours à usage unique, chiffrés en base. La 2FA n'est active qu'après un premier code correct. Activer, désactiver et générer de nouveaux codes redemandent le mot de passe.
- **Pas de code par email** (`/two-factor/send-otp` et `/two-factor/verify-otp` désactivés) : l'email sert déjà à réinitialiser le mot de passe, il ne serait pas un facteur indépendant.
- **Connexion en deux étapes** : après le mot de passe, la session n'est ouverte qu'avec un code (cookie temporaire de 10 minutes). Le journal d'audit (ADR 0015) compte la connexion au second facteur, pas au mot de passe. Ses hooks passent pour cela dans un plugin placé après celui de la 2FA : un hook `after` global passe avant les plugins et verrait une session que la 2FA annule ensuite.
- **Exigence par organisation** : champ `requireTwoFactor` de l'organisation (Better Auth, `additionalFields`), réglé par un `owner` ou un `admin` qui a lui-même la 2FA (sinon 403 `TWO_FACTOR_REQUIRED_FIRST`, il se fermerait la porte). Un membre sans 2FA n'a alors pas de `tenant_id` dans son token : l'API le traite comme sans accès. Le front l'envoie vers `/securite`, seule page qui lui reste ouverte, et ne contacte pas l'API.
- **Effet immédiat** (ADR 0016) : exiger la 2FA révoque les membres qui ne l'ont pas, et désactiver la sienne révoque l'utilisateur dans les organisations qui l'exigent. Le changement d'exigence va au journal d'audit.
- **Flag `account.two-factor`** (désactivé par défaut) : la page `/securite` et son lien. La connexion en deux étapes d'un compte qui l'a activée, et la page pour un membre que son organisation y oblige, n'en dépendent pas : un flag coupé ne doit enfermer personne dehors.

## Conséquences

- Un membre qui perd son téléphone se connecte avec un code de secours. Sans codes, il n'y a pas de récupération en libre-service : il faudra un support (back-office, lot suivant).
- Pas d'option « faire confiance à cet appareil » dans le front : le code est demandé à chaque connexion.
- La 2FA ne vaut que pour les comptes à mot de passe (limite de Better Auth) ; un fournisseur externe a la sienne.
- Le contrat de l'API ne change pas : elle ne sait rien de la 2FA, elle voit un token avec ou sans tenant.
- Une dépendance front : `react-qr-code` (MIT, `qrcode-generator`), pour le QR code ; la clé s'affiche aussi en texte.

## Alternatives écartées

- **Claim `amr` dans le token, vérifiée par l'API** : l'exigence vit dans le service d'identité ; la faire vérifier par l'API dupliquerait la règle et lierait le contrat à Better Auth.
- **Exigence globale, par variable d'environnement** : trop grossière pour un SaaS où chaque client décide.
- **Code par email ou SMS** : plus faible (email) ou coûteux et attaquable (SMS, échange de SIM).
