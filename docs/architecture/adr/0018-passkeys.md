# 0018. Passkeys : connexion sans mot de passe, valant la 2FA qu'une organisation exige

- **Statut** : Acceptée
- **Date** : 2026-11-17

## Contexte

La 2FA par application d'authentification (ADR 0017) ajoute une étape à chaque connexion. Les passkeys (WebAuthn) remplacent mot de passe et code par l'empreinte, le visage ou le code de l'appareil : elles résistent à l'hameçonnage, car liées au domaine, et prouvent à la fois la possession de l'appareil et la présence de l'utilisateur.

## Décision

- **Plugin `@better-auth/passkey`** (MIT, `@simplewebauthn/server`), dans `apps/auth`, avec Better Auth 1.7.25. Sa table `passkey` est créée par la migration habituelle du service. La cérémonie a lieu sur la page du front : `rpID` est le domaine d'`AUTH_APP_URL`, l'origine attendue son origine. Aucune variable nouvelle. **Vérification de l'utilisateur exigée** (`userVerification: 'required'`, à l'enregistrement comme à la connexion, et contrôlée par le serveur) : une passkey qui ne prouve que la présence (clé de sécurité sans PIN) est refusée, sans quoi la possession seule passerait pour la 2FA. Même limite anti-brute-force que les autres connexions (3 par 10 s et par IP).
- **Front** : `@simplewebauthn/browser` derrière un port `WebAuthn` du client d'auth (injectable : jsdom n'a pas WebAuthn). Connexion par un bouton « Se connecter avec une passkey », affiché seulement si le navigateur sait faire, et par les suggestions du champ email (`autocomplete="username webauthn"`, cérémonie en attente abandonnée quand le formulaire disparaît). Une fenêtre fermée par l'utilisateur ne montre aucune erreur.
- **Une session ouverte par passkey vaut la 2FA exigée** : la session porte `passkeySignIn` (champ de Better Auth, posé par le serveur seul, au chemin `/passkey/verify-authentication`). Le token d'une telle session porte le tenant d'une organisation qui exige la 2FA, et son utilisateur peut l'exiger à son tour. Le mot de passe seul reste refusé, même pour un compte qui a une passkey : c'est la session qui compte, pas le compte.
- **Audit** : la connexion par passkey est une connexion (`method: passkey/verify-authentication`). L'ajout et la suppression d'une passkey ne sont pas audités : ce sont des réglages du compte, sans tenant, comme l'activation de la 2FA.
- **Flag `account.passkeys`** (désactivé par défaut) : la section Passkeys de la page Sécurité (ajout, suppression), qui dépend elle-même d'`account.two-factor`. **Écarts au principe 6, choisis** : la page de connexion ne peut pas lire les flags (ils exigent un token), donc le bouton de connexion par passkey se voit même flag coupé, partout où le navigateur gère WebAuthn. Et, comme pour la 2FA (ADR 0017), le service d'identité ne lit pas les flags : ses routes `/passkey/*` répondent même flag coupé, et un appel direct peut enregistrer une passkey. Tant que personne ne peut ajouter de passkey, il ne mène à rien ; une fois des passkeys créées, couper le flag ne doit enfermer personne dehors.

## Conséquences

- Révocations (ADR 0016) : exiger la 2FA révoque aussi un membre sans TOTP connecté par passkey ; son token suivant, émis la seconde d'après, retrouve le tenant. Celui qui exige la 2FA n'est pas révoqué par sa propre action : il a passé le contrôle.
- Le domaine du front devient celui des passkeys : changer de domaine les rend inutilisables (il faudra en créer d'autres). Un front sur plusieurs sous-domaines demandera un `rpID` commun, à rendre configurable ce jour-là.
- Ajouter une passkey demande une session récente (Better Auth, `freshAge`) : au-delà, l'utilisateur se reconnecte d'abord.
- Une session ouverte avant ce déploiement a `passkeySignIn` faux : aucun changement pour elle.

## Alternatives écartées

- **Passkey comme second facteur après le mot de passe** : plus lent pour l'utilisateur, sans gain de sécurité, la passkey vérifiant déjà l'utilisateur.
- **Compter le compte (« a une passkey ») plutôt que la session** : un mot de passe volé ouvrirait alors l'accès à une organisation qui exige la 2FA.
- **Autofill seul, sans bouton** : invisible flag coupé, mais introuvable dans les navigateurs sans « conditional UI ».
