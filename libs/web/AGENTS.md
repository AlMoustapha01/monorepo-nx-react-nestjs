# AGENTS.md : libs/web

Libs front React. App qui les assemble : [`apps/web/AGENTS.md`](../../apps/web/AGENTS.md). Règles générales : [`AGENTS.md`](../../AGENTS.md) à la racine.

## Types de libs et frontières

| Projet Nx / alias                                      | Tag                | Contenu                                                                                                   | Peut dépendre de                   |
| ------------------------------------------------------ | ------------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `web-ui` (`@nx-react-nestjs/web-ui`)                   | `type:ui`          | design system : thème Tailwind 4, `cn`, `Stack`/`Text`/`Heading`, champs de formulaire, composants shadcn | `type:ui` seulement                |
| `web-data-access` (`@nx-react-nestjs/web-data-access`) | `type:data-access` | `createApiClient`, `ApiError`, `createQueryClient`, `useIdempotentMutation`                               | `type:contract`                    |
| `web-auth`, `libs/web/<feature>`                       | `type:feature`     | un écran ou parcours métier                                                                               | feature, ui, data-access, contract |

- `web-ui` n'importe ni `@tanstack/*`, ni `@nx-react-nestjs/contracts`, ni aucune autre lib.
- `fetch` n'apparaît que dans `web-data-access`.
- Une feature a la structure `src/lib/{components,hooks,data,states}/` et un `src/index.ts` qui est le seul point d'entrée public (exports nommés, jamais `export *`).
- Les alias TypeScript sont limités à `index.ts` : pas d'imports profonds.
- Aucun effet de bord à l'import d'un module `.ts`/`.tsx` (enregistrement global, mutation au chargement) : le build de l'app les déclare sans effet de bord pour découper les façades par route, et retirerait un module importé seulement pour son effet.
- `strict` et `noUncheckedIndexedAccess` sont activés partout.
- Règles de lint web (ban de `fetch`, `window.fetch` et `globalThis.fetch`, `lingui/no-unlocalized-strings`) : `libs/web/.oxlintrc.web.json`. `web-ui` ajoute le ban de `@tanstack/*`. `web-data-access` étend seulement la config racine (il est le seul à appeler `fetch`).
- Nouvelle lib feature : `pnpm new:web-feature <nom>` crée `libs/web/<nom>` (projet `web-<nom>`, alias `@nx-react-nestjs/web-<nom>`) avec sa config ; la forme de ses fichiers, de la requête à la route, est dans [Référence : une lib feature du front](../../docs/reference/feature-web.md). Ce qu'elle contient, à garder dans une lib créée à la main : un `.oxlintrc.json` `{ "extends": ["../.oxlintrc.web.json"] }` ; un `vitest.config.mts` qui reprend les plugins de `apps/web/vite.config.mts` (`@rolldown/plugin-babel` avec `@lingui/babel-plugin-lingui-macro`, plus `lingui()` de `@lingui/vite-plugin`), sinon les tests qui rendent `<Trans>` échouent, et `passWithNoTests`, pour qu'une lib encore sans test ne fasse pas échouer la CI ; un `lingui.config.ts` minimal à la racine de la lib, que lit la macro (`sourceLocale: 'fr'`, `locales: ['fr', 'en']`, sans `catalogs` : les catalogues restent dans `apps/web`, dont l'extraction parcourt `libs/web`) ; `src/test-utils.tsx` (`renderWithProviders` : i18n, React Query, routeur mémoire). `lingui.config.ts` et `test-utils.tsx` peuvent n'être importés par personne : les entrées `libs/web/*/lingui.config.ts` et `libs/web/*/src/test-utils.tsx` de `knip.json` les couvrent.

## Design system (`web-ui`)

- Pas de `<div>` stylé pour la mise en page ou le texte : `Stack`, `Text`, `Heading`.
- Thème : `src/lib/styles/theme.css` (tokens shadcn neutres, mode sombre via la classe `.dark`). Pas de couleur en dur : utiliser les tokens.
- Ajouter un composant shadcn : copier le fichier dans `src/lib/components/` avec des imports relatifs (pas de `components.json`, pas d'alias), l'exporter depuis `index.ts` et écrire sa story `*.stories.tsx`. Un composant qui affiche un libellé d'accessibilité le reçoit en prop obligatoire (ex. `DialogContent` exige `closeLabel`), car la lib n'a pas de chaîne en dur.
- Storybook 10 : `pnpm nx run web-ui:storybook` (http://localhost:6006), `pnpm nx run web-ui:build-storybook`.
- Thème, ajout d'un composant pas à pas, stories : [Design system](../../docs/guides/design-system.md).

## Données (`web-data-access` et features)

- Appels HTTP uniquement via `createApiClient`. Les erreurs sont des `ApiError` avec un `code` (`TIMEOUT`, `NETWORK_ERROR`, `HTTP_ERROR`, `INVALID_RESPONSE`, ou le code métier RFC 9457 de l'API). Une requête annulée remonte l'`AbortError` d'origine.
- Par ressource, dans la feature : un `data/keys.ts` (clés de requête) et une fabrique `queryOptions`, avec un `staleTime` explicite (défaut du client : 30 s).
- Filtres et pagination dans les search params de la route, validés par un schéma zod (pagination par curseur, comme l'API).
- Les réponses sont validées avec les schémas de `libs/shared/contracts`.
- Les mutations qui créent passent par `useIdempotentMutation` : un `Idempotency-Key` par appel de `mutate`, réutilisé lors des retries.
- Pas de retry sur les 4xx ; les échecs de mutation déclenchent le toast via `onMutationError`.

## Formulaires

`react-hook-form` + `zodResolver`, avec les schémas de `libs/shared/contracts` (les mêmes que l'API). Libellés et messages d'erreur localisés : le message affiché vient du composant (`t`), jamais du texte anglais de zod. Champs : `FormField` (un `Input`) et `TextareaField` (un `Textarea`) de `web-ui` relient libellé, `aria-invalid` et message d'erreur ; `FormError` affiche l'erreur globale en `role="alert"`. Ils prennent les props du champ, donc `{...form.register('title')}`. Exemple : `libs/web/auth`.

## État d'interface

`useState` d'abord. Jotai seulement si un état partagé le justifie (non installé). L'état serveur reste dans TanStack Query, l'état de navigation et les filtres dans l'URL.

## Tests

- Vitest + Testing Library : requêtes par rôle (`getByRole`) et nom accessible, `user-event` pour les interactions.
- Réseau simulé avec MSW, pas de mock de `fetch`.
- Les stories sont exécutées comme tests (`libs/web/ui/src/stories.spec.tsx`) : toute nouvelle story est donc testée.
- Lancer : `pnpm nx run-many -t lint typecheck test -p web-ui web-data-access`.
