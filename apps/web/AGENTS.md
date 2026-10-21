# AGENTS.md : apps/web

App React (Vite) qui assemble les libs `libs/web/*`. Conventions des libs : [`libs/web/AGENTS.md`](../../libs/web/AGENTS.md). Règles générales du monorepo : [`AGENTS.md`](../../AGENTS.md) à la racine.

## Commandes

| Besoin                                             | Commande                                                                        |
| -------------------------------------------------- | ------------------------------------------------------------------------------- |
| Lancer le front                                    | `pnpm nx serve web` → http://localhost:4200                                     |
| Appeler l'API avec un token de dev                 | `VITE_DEV_TOKEN=$(pnpm -s dev:token) pnpm nx serve web`                         |
| Extraire les chaînes vers les catalogues           | `cd apps/web && pnpm exec lingui extract --clean`                               |
| Vérifier que les catalogues sont à jour (comme CI) | `pnpm nx run web:i18n-check`                                                    |
| Vérifier le budget de poids du bundle              | `pnpm nx run web:size` (build d'abord, limite dans `apps/web/.size-limit.json`) |
| Lint, types, tests                                 | `pnpm nx run-many -t lint typecheck test -p web`                                |

`web:i18n-check` lance `lingui extract --clean` (il réécrit les catalogues en local), pose `git add --intent-to-add` sur `src/locales`, puis échoue si `git diff` n'est pas vide : committer les catalogues mis à jour.

Variables (voir `.env.example` à la racine) : `VITE_API_URL` (défaut `http://localhost:3000/api/v1`) et `VITE_DEV_TOKEN` (token de dev, absent par défaut).

## Rôle de l'app

Assemblage uniquement : routeur, providers, layout. La logique métier et l'UI réutilisable vivent dans `libs/web/*`.

- Une route = un fichier dans `src/routes/` (TanStack Router, routes par fichiers ; `routeTree.gen.ts` est généré, ne pas l'éditer).
- `src/routes/__root.tsx` : layout (sélecteur de langue, `Toaster` sonner), page d'erreur globale avec « Réessayer », page 404.
- `src/router.tsx` : `createAppRouter(queryClient, api, history?)` ; le contexte du routeur est `{ queryClient, api }` (les `loader` y trouvent le client API et le cache).
- `src/api.ts` : instance unique du client API (`createApiClient`).
- `src/i18n/` : Lingui. `resolveLocale` (langue du navigateur ramenée à sa base, `fr` par défaut), `activateLocale`, préférence en `localStorage` sous la clé `app.locale` (lecture et écriture protégées par try/catch). Pas de préfixe d'URL.
- Catalogues : `src/locales/{fr,en}/messages.po`. `fr` est la langue source.
- React Compiler est actif (plugin Babel de `@rolldown/plugin-babel`) : pas de `useMemo`/`useCallback` par réflexe.

## Règles

- Aucune chaîne visible en dur dans le JSX : `<Trans>` ou `t` de Lingui. Vérifié par `lingui/no-unlocalized-strings` sur les `.tsx` de `apps/web` et `libs/web/ui`. Limites connues : `title="…"` sur un `div` n'est jamais signalé, les `.ts` ne sont pas contrôlés (relire à la main).
- `useEffect` est limité aux synchronisations avec l'extérieur (abonnement, DOM, `reportError`). Pas pour dériver un état ni pour charger des données : `loader` ou TanStack Query.
- `fetch` est interdit hors de `libs/web/data-access` (lint). Passer par `api`.
- Erreurs : une zone qui peut échouer s'enveloppe dans `ErrorZone` (`src/components/error-zone.tsx`) ; toute erreur capturée passe par `reportError` (`src/report-error.ts`). C'est le point d'accroche d'un futur outil de suivi (Sentry n'est pas installé).
- Notifications : toasts via sonner. Les échecs de mutation sont déjà notifiés par le hook `onMutationError` de `createQueryClient`.
- L'app peut dépendre de feature, ui, data-access et contracts (tags Nx), jamais l'inverse.
- Budget : `web:size` limite le JS initial (gzip). Une hausse se justifie en revue ; préférer `lazy`/routes séparées avant de relever la limite.

## Feature flags

Le principe 6 de la racine (toute fonctionnalité derrière un flag) vaut pour l'API. Le mécanisme côté front n'est pas encore défini : il le sera avec le premier écran métier. Ne pas en improviser un avant.

## Différé volontairement

react-hook-form (à installer avec le premier formulaire), Jotai, Sentry, Playwright + axe, feature flags.
