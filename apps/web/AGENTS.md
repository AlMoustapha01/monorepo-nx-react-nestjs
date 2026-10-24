# AGENTS.md : apps/web

App React (Vite) qui assemble les libs `libs/web/*`. Conventions des libs : [`libs/web/AGENTS.md`](../../libs/web/AGENTS.md). Règles générales du monorepo : [`AGENTS.md`](../../AGENTS.md) à la racine.

## Commandes

| Besoin                                             | Commande                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| Lancer le front                                    | `pnpm nx serve web` → http://localhost:4200                                    |
| Appeler l'API avec un token de dev                 | `VITE_DEV_TOKEN=$(pnpm -s dev:token) pnpm nx serve web`                        |
| Extraire les chaînes vers les catalogues           | `cd apps/web && pnpm exec lingui extract --clean`                              |
| Vérifier que les catalogues sont à jour (comme CI) | `pnpm nx run web:i18n-check`                                                   |
| Vérifier le budget de poids du bundle              | `pnpm nx run web:size` (build d'abord, limite dans `apps/web/.size-limit.mts`) |
| Lint, types, tests                                 | `pnpm nx run-many -t lint typecheck test -p web`                               |

`web:i18n-check` lance `lingui extract --clean` (il réécrit les catalogues en local), pose `git add --intent-to-add` sur `src/locales`, puis échoue si `git diff` n'est pas vide : committer les catalogues mis à jour.

Variables (dans `apps/web/.env`, créé par `pnpm dev:setup` depuis `apps/web/.env.example` ; Vite ne lit pas le `.env` de la racine) : `VITE_API_URL` (défaut `http://localhost:3000/api/v1`), `VITE_AUTH_URL` (service d'identité, défaut `http://localhost:3100`) et `VITE_DEV_TOKEN` (token de dev, absent par défaut).

## Rôle de l'app

Assemblage uniquement : routeur, providers, layout. La logique métier et l'UI réutilisable vivent dans `libs/web/*`.

- Une route = un fichier dans `src/routes/` (TanStack Router, routes par fichiers ; `routeTree.gen.ts` est généré, ne pas l'éditer).
- `/` est la page d'accueil de base (`routes/_authenticated/index.tsx`).
- `src/routes/__root.tsx` : layout (navigation et compte une fois connecté, sélecteur de langue, `Toaster` sonner), page d'erreur globale avec « Réessayer », page 404.
- `src/router.tsx` : `createAppRouter({ queryClient, api, session }, history?)` ; le contexte du routeur donne aux `beforeLoad` et `loader` le client API, le cache et la session (`src/session.ts`).
- `src/api.ts` : instances uniques du client API et du client d'auth, et choix du mode (token de dev ou service d'auth).
- `src/i18n/` : Lingui. `resolveLocale` (langue du navigateur ramenée à sa base, `fr` par défaut), `activateLocale`, préférence en `localStorage` sous la clé `app.locale` (lecture et écriture protégées par try/catch). Pas de préfixe d'URL.
- Catalogues : `src/locales/{fr,en}/messages.po`. `fr` est la langue source.
- React Compiler est actif (plugin Babel de `@rolldown/plugin-babel`) : pas de `useMemo`/`useCallback` par réflexe.

<!-- example:start -->

Boutique d'exemple (lib `web-storefront`) : groupe de routes `routes/_authenticated/(boutique)/` (les parenthèses ne changent pas les URL) : catalogue sur `/boutique`, puis `/panier`, `/commandes`, `/commandes/$orderId`. Son code est dans ses propres fichiers ou entre `// example:start` et `// example:end` (`{/* example:start */}` dans le JSX, lignes entières) : `pnpm strip:examples` le retire sans réécrire le code de base. Ses tests : `src/storefront.spec.tsx` (banc commun : `src/testing/app-harness.tsx`) et `apps/web-e2e/src/storefront*.ts` (`publishProduct`, pages de la boutique pour l'accessibilité). En local : `FEATURE_FLAGS=storefront=true pnpm nx serve api`.

<!-- example:end -->

## Règles

- Aucune chaîne visible en dur dans le JSX : `<Trans>` ou `t` de Lingui. Vérifié par `lingui/no-unlocalized-strings` sur les `.tsx` de `apps/web` et `libs/web/ui`. Limites connues : `title="…"` sur un `div` n'est jamais signalé, les `.ts` ne sont pas contrôlés (relire à la main).
- `useEffect` est limité aux synchronisations avec l'extérieur (abonnement, DOM, `reportError`). Pas pour dériver un état ni pour charger des données : `loader` ou TanStack Query.
- `fetch` est interdit hors de `libs/web/data-access` (lint). Passer par `api`.
- Erreurs : une zone qui peut échouer s'enveloppe dans `ErrorZone` (`src/components/error-zone.tsx`) ; toute erreur capturée passe par `reportError` (`src/report-error.ts`). C'est le point d'accroche d'un futur outil de suivi (Sentry n'est pas installé).
- Notifications : toasts via sonner. Les échecs de mutation sont déjà notifiés par le hook `onMutationError` de `createQueryClient`.
- L'app peut dépendre de feature, ui, data-access et contracts (tags Nx), jamais l'inverse.
- Budget : `web:size` limite le JS initial (gzip) : script d'entrée et `modulepreload` de `index.html`, sans les chunks des routes chargées à la demande. Les libs sont déclarées sans effet de bord à l'import (`vite.config.mts`) : importer une façade au démarrage n'y entraîne que ce qui est utilisé. Une hausse se justifie en revue ; préférer `lazy`/routes séparées avant de relever la limite.

## Authentification

Deux modes, comme l'API (secret ou JWKS) :

- **Service d'identité** (par défaut, et toujours en production) : connexion au service Better Auth (`apps/auth`). Lancer `pnpm nx serve auth`, l'API avec `AUTH_JWKS_URL`, puis `pnpm dev:seed` pour les comptes de démo (`staff@shop.local`, `dev@shop.local`, mot de passe `demo-password-1234`).
- **Token de dev** (`VITE_DEV_TOKEN`, dev seulement) : aucune connexion, ce token est envoyé à l'API.

Fonctionnement :

- La session est un cookie du service d'auth. L'API reçoit un access token de 15 min (`GET /api/auth/token`), gardé **en mémoire seulement** (`createAccessTokenSource`, jamais dans localStorage), renouvelé avant expiration ; un 401 de l'API le renouvelle et rejoue la requête une fois.
- Pages publiques : `/connexion`, `/inscription`, `/mot-de-passe-oublie`, `/reinitialiser-mot-de-passe`. Avec session : `/organisations/nouvelle`, `/invitations/$invitationId` (lien de l'email d'invitation).
- Les pages de l'app vivent sous la route layout `routes/_authenticated` (URL inchangées) : sans session, `/connexion?redirect=<page>` ; sans organisation active (pas de tenant), `/organisations/nouvelle`. Une nouvelle page protégée va dans `routes/_authenticated/`.
- `redirect` n'accepte qu'un chemin de l'app (`safeRedirect`) : la page de connexion n'est pas un redirecteur ouvert.
- Connexion, déconnexion, changement d'organisation : `resetSession` oublie le token et vide tout le cache (données de l'ancien utilisateur ou de l'ancien tenant).
- Écrans et formulaires : lib `libs/web/auth` (react-hook-form + schémas zod de `contracts`) ; client HTTP : `createAuthClient` (`web-data-access`).

## Feature flags

Le principe 6 de la racine vaut aussi pour le front. Les flags sont déclarés dans `FEATURE_FLAGS` (contracts) ; ceux marqués `client: true` sont exposés par `GET /api/v1/feature-flags`.

- Le `beforeLoad` de `_authenticated` charge les flags une fois (ils exigent un token) (`featureFlagsQueryOptions`, `staleTime: Infinity`) avant le premier rendu.
- Garder une route : `beforeLoad: requireFeature('<flag>')` (`src/feature-flags.ts`) ; flag coupé = 404.
- Lire un flag dans un composant de l'app : `useFeatureFlag('<flag>')`. Les libs `libs/web/*` ne lisent aucun flag : elles reçoivent des booléens en props.
- Repli « tout coupé » : si l'appel échoue, les flags sont tous faux et l'erreur passe par `reportError` ; la page s'affiche quand même.
- En local : `FEATURE_FLAGS=<flag>=true pnpm nx serve api`.

## Différé volontairement

Jotai, Sentry.

## Parcours navigateur (`apps/web-e2e`)

Playwright contre la vraie stack, démarrée une fois par exécution (`src/stack.ts`) : Postgres, Redis et Mailpit via Testcontainers, les vraies migrations (`migrate.js`), le service d'auth et l'API compilés (JWKS), le front construit et servi par `vite preview` (ports 4310, 3310, 3110). Les process tournent dans un dossier vide : aucun `.env` local ne s'en mêle.

- Lancer : `pnpm nx run web-e2e:e2e` (Docker requis ; `pnpm exec playwright install chromium` la première fois). Rapport, traces, captures et journaux des services : `dist/.playwright/apps/web-e2e`.
- Un parcours couvre ce qu'un test unitaire ne voit pas : redirections entre services, emails (lus dans Mailpit, `linkFromEmail`), cookies, tokens, plusieurs tenants. Le reste se teste en Vitest.
- Chaque test crée ses propres comptes (`uniqueEmail`) : ils tournent en parallèle sur la même base. Préparer les données par l'API (`createAccount`, `createOrganization`, `invite` dans `support.ts`), et ne passer par l'interface que pour ce qui est testé.
- Accessibilité : `@axe-core/playwright`, WCAG 2.1 A et AA, sur les pages publiques et l'app connectée. Une page nouvelle s'ajoute à `accessibility.spec.ts`, formulaire en erreur compris s'il y en a un ; derrière un flag, l'activer dans `E2E_FEATURE_FLAGS` (`src/stack.ts`), sinon elle répond 404.
- Le projet ne dépend d'aucune lib (`scope:e2e`) : il teste l'app de l'extérieur.
