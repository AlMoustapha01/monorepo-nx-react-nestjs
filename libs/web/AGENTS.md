# AGENTS.md : libs/web

Libs front React. App qui les assemble : [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md). Règles générales : [`AGENTS.md`](../../AGENTS.md) à la racine.

## Types de libs et frontières

| Projet Nx / alias                                      | Tag                | Contenu                                                                             | Peut dépendre de                   |
| ------------------------------------------------------ | ------------------ | ----------------------------------------------------------------------------------- | ---------------------------------- |
| `web-ui` (`@nx-react-nestjs/web-ui`)                   | `type:ui`          | design system : thème Tailwind 4, `cn`, `Stack`/`Text`/`Heading`, composants shadcn | `type:ui` seulement                |
| `web-data-access` (`@nx-react-nestjs/web-data-access`) | `type:data-access` | `createApiClient`, `ApiError`, `createQueryClient`, `useIdempotentMutation`         | `type:contract`                    |
| `libs/web/<feature>` (à venir)                         | `type:feature`     | un écran ou parcours métier                                                         | feature, ui, data-access, contract |

- `web-ui` n'importe ni `@tanstack/*`, ni `@nx-react-nestjs/contracts`, ni aucune autre lib.
- `fetch` n'apparaît que dans `web-data-access`.
- Une feature a la structure `src/lib/{components,hooks,data,states}/` et un `src/index.ts` qui est le seul point d'entrée public (exports nommés, jamais `export *`).
- Les alias TypeScript sont limités à `index.ts` : pas d'imports profonds.
- `strict` et `noUncheckedIndexedAccess` sont activés partout.
- Règles de lint web (ban de `fetch`, `window.fetch` et `globalThis.fetch`, `lingui/no-unlocalized-strings`) : `libs/web/.oxlintrc.web.json`. `web-ui` ajoute le ban de `@tanstack/*`. `web-data-access` étend seulement la config racine (il est le seul à appeler `fetch`).
- Nouvelle lib feature : son `.oxlintrc.json` contient `{ "extends": ["../.oxlintrc.web.json"] }`, et son `vitest.config.mts` reprend ceux de `apps/web`/`web-ui` : plugin babel de la macro Lingui + `lingui()`, sinon les tests qui rendent `<Trans>` échouent.

## Design system (`web-ui`)

- Pas de `<div>` stylé pour la mise en page ou le texte : `Stack`, `Text`, `Heading`.
- Thème : `src/lib/styles/theme.css` (tokens shadcn neutres, mode sombre via la classe `.dark`). Pas de couleur en dur : utiliser les tokens.
- Ajouter un composant shadcn : copier le fichier dans `src/lib/components/` avec des imports relatifs (pas de `components.json`, pas d'alias), l'exporter depuis `index.ts` et écrire sa story `*.stories.tsx`. Un composant qui affiche un libellé d'accessibilité le reçoit en prop obligatoire (ex. `DialogContent` exige `closeLabel`), car la lib n'a pas de chaîne en dur.
- Storybook 10 : `pnpm nx run web-ui:storybook` (http://localhost:6006), `pnpm nx run web-ui:build-storybook`.

## Données (`web-data-access` et features)

- Appels HTTP uniquement via `createApiClient`. Les erreurs sont des `ApiError` avec un `code` (`TIMEOUT`, `NETWORK_ERROR`, `HTTP_ERROR`, `INVALID_RESPONSE`, ou le code métier RFC 9457 de l'API). Une requête annulée remonte l'`AbortError` d'origine.
- Par ressource, dans la feature : un `data/keys.ts` (clés de requête) et une fabrique `queryOptions`, avec un `staleTime` explicite (défaut du client : 30 s).
- Filtres et pagination dans les search params de la route, validés par un schéma zod (pagination par curseur, comme l'API).
- Les réponses sont validées avec les schémas de `libs/shared/contracts`.
- Les mutations qui créent passent par `useIdempotentMutation` : un `Idempotency-Key` par appel de `mutate`, réutilisé lors des retries.
- Pas de retry sur les 4xx ; les échecs de mutation déclenchent le toast via `onMutationError`.

## Formulaires

Convention pour le premier formulaire (react-hook-form n'est pas encore installé) : `react-hook-form` + `zodResolver`, avec les schémas de `libs/shared/contracts` (les mêmes que l'API). Libellés et messages d'erreur localisés.

## État d'interface

`useState` d'abord. Jotai seulement si un état partagé le justifie (non installé). L'état serveur reste dans TanStack Query, l'état de navigation et les filtres dans l'URL.

## Tests

- Vitest + Testing Library : requêtes par rôle (`getByRole`) et nom accessible, `user-event` pour les interactions.
- Réseau simulé avec MSW, pas de mock de `fetch`.
- Les stories sont exécutées comme tests (`libs/web/ui/src/stories.spec.tsx`) : toute nouvelle story est donc testée.
- Lancer : `pnpm nx run-many -t lint typecheck test -p web-ui web-data-access`.
