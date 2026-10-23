# Boilerplate web : stack, configuration du repo, design system

Date : 2026-10-21
Référence : document « Frontend React en production — leçons de gros repos open source » (claude.ai/artifact/U2PXRHe4pcgx993FH3K9vq), section « Stack recommandée ».

## Intention

`apps/web` est aujourd'hui l'app générée par Nx (`nx-welcome.tsx`). Avant d'écrire le moindre écran, on veut un socle front aussi cadré que l'API : stack choisie et branchée, frontières vérifiées par l'outillage, design system neutre prêt à l'emploi. Le premier écran métier doit pouvoir s'écrire en suivant des conventions déjà en place, sans décision d'architecture à prendre.

## Objectifs

1. Stack applicative installée, configurée et démontrée par un code minimal (pas d'écran métier).
2. Configuration du repo : frontières Nx front, lint, typage strict, knip, CI couvrent `apps/web` et `libs/web/*`.
3. Design system `libs/web/ui` neutre (base shadcn/ui), documenté dans Storybook.
4. Conventions écrites dans `apps/web/AGENTS.md` et `libs/web/AGENTS.md`, et un résumé dans l'`AGENTS.md` racine.

## Non-objectifs

- Aucun écran métier (catalogue, commandes…). Une seule page d'accueil vide qui prouve que le routeur, le design system et l'i18n fonctionnent.
- Pas d'authentification côté front (connexion, refresh). Le client HTTP prévoit seulement un point d'injection du token ; en dev, le token peut venir de `pnpm -s dev:token` via une variable `VITE_DEV_TOKEN`.
- Pas de Sentry branché (pas de DSN). Seul le point d'accroche existe (ErrorBoundary + fonction `reportError` à brancher).
- Pas de Playwright ni d'axe tant qu'aucun parcours critique n'existe.
- Pas d'identité visuelle : tokens neutres shadcn, ajustables plus tard.

## Anti-objectifs (échec même si « ça marche »)

- Composants génériques ailleurs que dans `libs/web/ui`, ou `libs/web/ui` qui importe du code applicatif.
- Appels `fetch` directs dans des composants ; état serveur dans un store global.
- Chaînes visibles en dur dans le JSX.
- Règles qui n'existent que dans la doc : chaque frontière annoncée doit être vérifiée par le lint ou le typage.
- PR de plus de 500 lignes (hors lockfile et fichiers générés par un outil, comme les catalogues Lingui).

## Contraintes du repo

- Nx 23, pnpm, Node 24, Vite 8, Vitest 5, TypeScript 6, Oxlint + Oxfmt (pas d'ESLint, pas de Prettier), knip, zod 4.
- `@nx/enforce-module-boundaries` est déjà configuré dans `.oxlintrc.json` via `jsPlugins` ; `scope:web` → `scope:web|shared` existe déjà.
- Alias TypeScript limités au `index.ts` de chaque lib (pas d'import profond).
- API : `http://localhost:3000/api/v1`, CORS via `CORS_ORIGINS` (credentials), erreurs en RFC 9457 (`application/problem+json`, avec un `code` stable), en-tête `x-request-id` renvoyé par l'API, pagination par curseur (`items`, `nextCursor`).
- Contrats zod partagés dans `@nx-react-nestjs/contracts` (`scope:shared`, `type:contract`).

## Décisions (prises avec l'utilisateur)

- Focus : stack + config du repo + design system, avant tout écran.
- Design system neutre, base shadcn/ui.
- Choix techniques du document de référence :

| Besoin           | Choix                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------- |
| Build            | Vite + `@vitejs/plugin-react` + React Compiler (`babel-plugin-react-compiler`)                       |
| Routage          | TanStack Router, routes fichier (plugin Vite), chargées à la demande, search params validés par zod  |
| État serveur     | TanStack Query : un `keys.ts` + une fabrique `queryOptions` par ressource, `staleTime` explicite     |
| État d'interface | `useState` d'abord ; Jotai seulement si un état traverse l'arbre (non installé tant que non utilisé) |
| Formulaires      | react-hook-form + `@hookform/resolvers/zod`, schémas de `contracts`                                  |
| UI               | Tailwind 4 + composants shadcn/ui (primitives Radix) copiés dans `libs/web/ui`                       |
| i18n             | Lingui (macro, extraction en CI)                                                                     |
| Erreurs          | `react-error-boundary` par zone + page d'erreur globale                                              |
| Notifications    | sonner                                                                                               |
| Tests            | Vitest + Testing Library + user-event + MSW ; Storybook (`@storybook/react-vite` + addon-vitest)     |
| Qualité          | Oxlint (react, jsx-a11y, frontières Nx), Oxfmt, knip, size-limit                                     |

- Règles vérifiées par l'outillage : chaînes visibles en dur dans le JSX (`eslint-plugin-lingui`, règle `no-unlocalized-strings`, chargé via `jsPlugins` d'oxlint) et `fetch` direct hors de `libs/web/data-access` (`no-restricted-globals` en override). Les autres règles (pas d'état serveur dans un store global, pas de `<div>` stylé pour la mise en page, composants génériques uniquement dans `ui`) restent dans `AGENTS.md`. Les frontières entre libs sont vérifiées par `@nx/enforce-module-boundaries`.
- Langue : détection du navigateur, puis préférence mémorisée (`localStorage`, lecture protégée par try/catch), et un sélecteur fr/en sur la page d'accueil. Pas de préfixe de langue dans l'URL.
- Feature flags : hors périmètre de ce socle. `apps/web/AGENTS.md` indique que le mécanisme sera défini avec le premier écran métier.

## Structure cible

```
apps/web/                         # assemblage uniquement (scope:web, type:app)
  src/main.tsx                    # providers : QueryClient, Router, I18n, Toaster
  src/routes/                     # TanStack Router, une route = un fichier
  src/routeTree.gen.ts            # généré par le plugin, ignoré par lint/format/knip
libs/web/
  ui/                             # design system (scope:web, type:ui)
    src/index.ts                  # façade : composants + utilitaire cn
    src/lib/components/           # Button, Input, Label, Text, Heading, Stack, Card, Dialog…
    src/lib/styles/theme.css      # tokens CSS (variables shadcn), import Tailwind
  data-access/                    # client HTTP + intégration Query (scope:web, type:data-access)
    src/index.ts                  # apiClient, ApiError, createQueryClient, helpers queryOptions
  i18n/ (optionnel, voir « laissé au builder »)
libs/web/<fonctionnalité>/        # futur (scope:web, type:feature) : components/ hooks/ data/ states/ index.ts
```

## Frontières (à ajouter dans `.oxlintrc.json`)

- `type:app` (web) peut dépendre de `type:feature`, `type:ui`, `type:data-access`, `type:contract` en plus des tags API existants.
- `type:feature` → `type:feature` (façade uniquement, garanti par les alias), `type:ui`, `type:data-access`, `type:contract`.
- `type:ui` → `type:ui` uniquement (ni contrats, ni données : purement visuel).
- `type:data-access` → `type:contract`.
- Les composants de `libs/web/ui` n'importent jamais `@tanstack/*`.

## Comportements attendus

- **Client HTTP** (`data-access`) : base URL depuis `VITE_API_URL` (défaut `http://localhost:3000/api/v1`), timeout (AbortSignal), `Authorization: Bearer` si un fournisseur de token renvoie une valeur, `x-request-id` généré par requête, corps `problem+json` converti en `ApiError` (status, code, title, detail, requestId). Validation optionnelle de la réponse par un schéma zod des contrats.
- **QueryClient** : `staleTime` par défaut explicite, pas de retry sur 4xx, les erreurs de mutation non gérées déclenchent un toast générique.
- **Routes** : `__root` avec ErrorBoundary globale et `Outlet`, une route `/` minimale (Heading + Text traduits), une route 404. Code-splitting automatique activé.
- **i18n** : locale `fr` par défaut, `en` en second ; `lingui extract` en CI échoue si un message manque dans le catalogue source.
- **Design system** : une story par composant ; mode sombre via la classe `.dark` (tokens shadcn) ; règle documentée « pas de `<div>` stylé pour la mise en page, utiliser Stack/Text/Heading ».

## Tests et CI

- Tests de comportement : `apiClient` (conversion problem+json, timeout, en-têtes) avec MSW ; un test de rendu de la route `/` ; les stories Storybook exécutées comme tests via addon-vitest.
- La CI existante (`nx affected -t lint typecheck test build`) couvre les nouveaux projets sans nouveau job, sauf l'extraction Lingui et size-limit (ajoutés comme cibles Nx sur `web`).
- `knip.json` étendu aux fichiers front (entrées `apps/web/src/main.tsx`, routes, stories, configs).

## Découpage en PR (< 500 lignes chacune)

1. Configuration : tsconfig strict + `noUncheckedIndexedAccess` pour le web, React Compiler, frontières et tags, knip étendu, suppression de `nx-welcome`.
2. `libs/web/ui` : Tailwind 4, tokens, `cn`, premiers composants, Storybook.
3. `libs/web/data-access` : client HTTP, `ApiError`, QueryClient, MSW et ses tests.
4. `apps/web` : TanStack Router, providers, ErrorBoundary, sonner, route `/` et 404.
5. Lingui (config, catalogues, cible d'extraction) + size-limit + `AGENTS.md`.

## Arbitrages de l'auteur (à relire)

- **Stories comme tests sans navigateur** : rendues dans jsdom via `composeStories` (portable stories) dans Vitest. Pas d'addon-vitest en mode navigateur, donc pas de Chromium à installer en CI. On repassera au mode navigateur avec Playwright quand il arrivera pour les parcours critiques.
- **Le code copié par la CLI shadcn compte dans les 500 lignes.** La PR 2 est donc coupée en deux : 2a pour Tailwind, les tokens, `cn`, Storybook et Stack/Text/Heading ; 2b pour les composants shadcn et leurs stories.
- **Idempotence** : le client accepte une option `idempotencyKey` (en-tête `Idempotency-Key`, déjà exigé par `POST /orders`). Le helper de mutation génère cette clé une fois par appel à `mutate` et la réutilise à chaque retry. `ETag` et `Idempotent-Replayed` sont ignorés pour l'instant.

## Laissé au builder

- Versions exactes des paquets (dernières stables compatibles avec React 19, Vite 8 et Vitest 5).
- Liste exacte des composants shadcn de départ (minimum : Button, Input, Label, Card, Dialog, plus les primitives de mise en page maison Stack, Text, Heading).
- Placer la config i18n dans `apps/web` ou dans une lib dédiée.
- Seuil initial de size-limit (mesurer, puis fixer environ 10 % au-dessus).
- Le générateur Nx pour créer les libs (`@nx/react:library`) ou une création manuelle alignée sur les libs existantes.
