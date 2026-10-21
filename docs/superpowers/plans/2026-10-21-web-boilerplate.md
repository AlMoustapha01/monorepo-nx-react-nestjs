# Boilerplate web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'app Nx générée par un socle front cadré : stack branchée, frontières vérifiées, design system neutre, sans écran métier.

**Architecture:** `apps/web` assemble (TanStack Router, providers) ; `libs/web/ui` est le design system purement visuel (Tailwind 4 + shadcn/Radix + Storybook) ; `libs/web/data-access` porte le client HTTP et l'intégration TanStack Query. Les règles annoncées sont vérifiées par Oxlint (frontières Nx, chaînes non traduites, `fetch` interdit hors data-access).

**Tech Stack:** Vite 8, `@vitejs/plugin-react` 6 + `@rolldown/plugin-babel` (React Compiler, macro Lingui), TanStack Router/Query, react-hook-form + zod 4, Tailwind 4, `radix-ui`, Lingui 6, react-error-boundary, sonner, Vitest 5 + Testing Library + MSW, Storybook 10, size-limit.

**Spec:** `docs/superpowers/specs/2026-10-21-web-boilerplate-design.md`

## Global Constraints

- Aucun écran métier ; une page d'accueil (`/`) et une 404 seulement.
- Pas de Sentry, pas de Playwright, pas de feature flags, pas de Jotai.
- Chaque tâche ≤ 500 lignes de diff hors lockfile et fichiers générés par un outil (catalogues Lingui, `routeTree.gen.ts`) ; le code copié de shadcn compte.
- `libs/web/ui` n'importe ni `@tanstack/*`, ni `@nx-react-nestjs/contracts`, ni aucune autre lib.
- `fetch` n'apparaît que dans `libs/web/data-access`.
- Aucune chaîne visible en dur dans le JSX (à partir de la tâche 7, vérifié par lint).
- `strict: true` + `noUncheckedIndexedAccess: true` sur `apps/web` et `libs/web/*`.
- API : `VITE_API_URL` (défaut `http://localhost:3000/api/v1`), token de dev `VITE_DEV_TOKEN`, erreurs RFC 9457 avec `code`, en-tête `x-request-id`, `Idempotency-Key` sur les mutations idempotentes.
- Langue : `fr` (source, défaut) et `en` ; détection navigateur puis préférence en `localStorage` (try/catch) ; pas de préfixe d'URL.
- Commits en anglais, Conventional Commits, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Après chaque tâche : `pnpm check` passe.

## Review Focus

1. Une requête annulée par l'appelant (changement de route, annulation TanStack Query) remonte l'`AbortError` d'origine : ni `ApiError` `TIMEOUT`, ni toast. → test tâche 4.
2. Une réponse d'erreur au corps vide ou non JSON (502 d'un proxy) donne `ApiError` `HTTP_ERROR` avec le bon status, pas une erreur de parsing JSON. → test tâche 4.
3. `localStorage` qui lève une exception (navigation privée, stockage bloqué) : la langue retombe sur la détection navigateur, l'app démarre. → test tâche 7.
4. Langues navigateur avec région (`en-US`, `fr-CA`) ramenées à la langue de base ; langue non gérée (`de`) → `fr`. → test tâche 7.
5. Une URL inconnue affiche la page 404 dans le layout, pas la page d'erreur globale ni un écran blanc. → test tâche 6.

---

### Task 1: Configuration du repo pour le front (PR 1)

**Files:**

- Modify: `.oxlintrc.json` (depConstraints)
- Modify: `apps/web/tsconfig.json`, `apps/web/vite.config.mts`, `apps/web/src/main.tsx`, `apps/web/src/app/app.tsx`, `apps/web/src/app/app.spec.tsx`
- Delete: `apps/web/src/app/nx-welcome.tsx`, `apps/web/src/app/app.module.css`
- Modify: `knip.json`, `nx.json` (générateur `@nx/react` : `babel: false`), `package.json` (deps)

**Interfaces:**

- Produces: tags `type:ui`, `type:data-access`, `type:feature` reconnus par les frontières ; `apps/web/vite.config.mts` avec React Compiler, `envDir: '../../'`.

- [ ] **Step 1: Réécrire `app.spec.tsx`** : `App` rend un `heading` de niveau 1 au texte `Boilerplate web` (requête `getByRole('heading', { level: 1 })`). Lancer `pnpm nx test web` → FAIL.
- [ ] **Step 2: Remplacer `App`** par un composant minimal (un `<h1>`), supprimer `nx-welcome.tsx` et `app.module.css`. Test → PASS.
- [ ] **Step 3: React Compiler** : installer `@rolldown/plugin-babel`, `@babel/core`, `babel-plugin-react-compiler` ; `plugins: [react(), babel({ presets: [reactCompilerPreset()] })]` (voir README de `@vitejs/plugin-react` 6). Ajouter `envDir: '../../'` à la config. `pnpm nx build web` → succès.
- [ ] **Step 4: tsconfig** : `noUncheckedIndexedAccess: true` dans `apps/web/tsconfig.json` (déjà `strict`). `pnpm nx typecheck web` → succès.
- [ ] **Step 5: Frontières** dans `.oxlintrc.json` :
  - `type:app` → ajouter `type:feature`, `type:ui`, `type:data-access` ;
  - `{ sourceTag: 'type:feature', onlyDependOnLibsWithTags: ['type:feature', 'type:ui', 'type:data-access', 'type:contract'] }` ;
  - `{ sourceTag: 'type:ui', onlyDependOnLibsWithTags: ['type:ui'] }` ;
  - `{ sourceTag: 'type:data-access', onlyDependOnLibsWithTags: ['type:contract'] }`.
- [ ] **Step 6: knip** : entrées `apps/web/src/main.tsx`, `apps/web/src/routes/**/*.tsx`, `libs/web/*/src/**/*.stories.tsx` ; `project` étendu à `apps/web/**/*.{ts,tsx}` et `libs/**/*.{ts,tsx}` ; `ignore: ['apps/web/src/routeTree.gen.ts']`. Retirer `@testing-library/dom` d'`ignoreDependencies` seulement si knip le demande. `pnpm knip` → aucun problème.
- [ ] **Step 7: Vérifier** `pnpm check` → succès.
- [ ] **Step 8: Commit** `chore(web): prepare web app config and frontend boundaries`.

### Task 2: `libs/web/ui` — fondations (PR 2a)

**Files:**

- Create: `libs/web/ui/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,vitest.config.mts,.oxlintrc.json}` (modèle : `libs/shared/contracts`, environnement `jsdom`, `jsx: react-jsx`, plugins oxlint `react`, `jsx-a11y`, `vitest`)
- Create: `libs/web/ui/src/index.ts`, `src/lib/utils/cn.ts`, `src/lib/styles/theme.css`, `src/lib/components/{stack,text,heading}.tsx` + `.stories.tsx`
- Create: `libs/web/ui/.storybook/{main.ts,preview.tsx}`, `libs/web/ui/src/test-setup.ts`, `libs/web/ui/src/stories.spec.tsx`
- Modify: `tsconfig.base.json` (alias `@nx-react-nestjs/web-ui` → `./libs/web/ui/src/index.ts`), `apps/web/vite.config.mts` (`@tailwindcss/vite`), `apps/web/src/styles.css`

**Interfaces:**

- Produces (exports nommés de `@nx-react-nestjs/web-ui`) :
  - `cn(...inputs: ClassValue[]): string` (clsx + tailwind-merge)
  - `Stack(props: { as?: 'div'|'section'|'main'|'header'|'footer'|'nav'|'ul'|'ol'; direction?: 'row'|'column' /* 'column' */; gap?: 0|1|2|3|4|6|8 /* 4 */; align?: 'start'|'center'|'end'|'stretch'; justify?: 'start'|'center'|'end'|'between'; wrap?: boolean; className?: string; children?: ReactNode })`
  - `Text(props: { as?: 'p'|'span'|'div' /* 'p' */; size?: 'sm'|'base'|'lg'; tone?: 'default'|'muted'|'destructive'; weight?: 'normal'|'medium'|'semibold'; className?; children? })`
  - `Heading(props: { level: 1|2|3|4; className?; children? })` → `h{level}`, taille par défaut selon le niveau
- Produces: tokens CSS shadcn « neutral » (variables `:root` et `.dark`, `@theme inline`), mode sombre par la classe `.dark` (`@custom-variant dark (&:is(.dark *))`).
- Project tags `["scope:web", "type:ui"]` ; cibles `typecheck` (run-commands comme contracts), `storybook` (`storybook dev -p 6006 -c .storybook`, cwd projet) et `build-storybook` (sortie `dist/storybook/web-ui`).

- [ ] **Step 1: Créer le projet** et ses configs ; `noUncheckedIndexedAccess: true`. `pnpm nx show project web-ui` liste `lint`, `test`, `typecheck`.
- [ ] **Step 2: Test qui échoue**, `src/lib/components/stack.spec.tsx` : `<Stack as="ul" direction="row" gap={2}>` rend un `ul` avec les classes `flex`, `flex-row`, `gap-2` ; par défaut `div` avec `flex-col` et `gap-4`. Idem `heading.spec.tsx` : `<Heading level={2}>` rend `getByRole('heading', { level: 2 })`. `pnpm nx test web-ui` → FAIL.
- [ ] **Step 3: Implémenter** `cn`, `Stack`, `Text`, `Heading` avec `class-variance-authority`. Tests → PASS.
- [ ] **Step 4: Thème** : `theme.css` = `@import 'tailwindcss'; @import 'tw-animate-css';` + tokens neutres shadcn + `@source '../../';` (scan de la lib). `apps/web/src/styles.css` importe ce fichier par chemin relatif (`../../../libs/web/ui/src/lib/styles/theme.css`) et ajoute `@source` sur `apps/web/src` et `libs/web`. L'alias TS ne sert qu'au JS.
- [ ] **Step 5: Storybook** : `main.ts` (`framework: '@storybook/react-vite'`, `stories: ['../src/**/*.stories.tsx']`, `viteFinal` ajoute `@tailwindcss/vite`) ; `preview.tsx` importe `theme.css` et ajoute un global `theme` (light/dark) qui pose la classe `.dark` sur le conteneur. Une story par composant (CSF3, `satisfies Meta<typeof X>`). `pnpm nx run web-ui:build-storybook` → succès.
- [ ] **Step 6: Stories exécutées comme tests** : `test-setup.ts` importe `@testing-library/jest-dom/vitest` et appelle `setProjectAnnotations(preview)`. `stories.spec.tsx` charge `import.meta.glob('./**/*.stories.tsx', { eager: true })` et, pour chaque story de `composeStories(module)`, génère `it('<fichier> › <Story>', () => Story.run())`. `pnpm nx test web-ui` → toutes les stories passent.
- [ ] **Step 7: Vérifier** que `apps/web` affiche un `Heading` du design system à la place du `<h1>` brut (test de la tâche 1 inchangé et vert). `pnpm check` → succès.
- [ ] **Step 8: Commit** `feat(web-ui): add design system foundations with Tailwind and Storybook`.

### Task 3: `libs/web/ui` — composants shadcn (PR 2b)

**Files:**

- Create: `libs/web/ui/src/lib/components/{button,input,label,card,dialog}.tsx` + `.stories.tsx`
- Modify: `libs/web/ui/src/index.ts`

**Interfaces:**

- Produces : `Button` + `buttonVariants` (variants `default|destructive|outline|secondary|ghost|link`, tailles `default|sm|lg|icon`, prop `asChild`) ; `Input` ; `Label` ; `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter` ; `Dialog`, `DialogTrigger`, `DialogContent` (prop requise `closeLabel: string` pour le bouton de fermeture : la lib n'embarque aucun texte), `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter`, `DialogClose`.

- [ ] **Step 1: Stories avec `play` qui échouent** (pas encore de composant) :
  - `Button` : un `fn()` en `onClick` ; le `play` clique le bouton (`userEvent`) et attend un appel ;
  - `Dialog` : le `play` clique le déclencheur et attend `getByRole('dialog')`, puis clique le bouton nommé `closeLabel` et attend la disparition du dialog ;
  - `Label` + `Input` : `getByLabelText` trouve l'input.
    `pnpm nx test web-ui` → FAIL.
- [ ] **Step 2: Copier les composants** depuis shadcn/ui (style new-york, primitives du paquet `radix-ui`, icône `X` de `lucide-react`) et réécrire leurs imports en relatif (`../utils/cn`). Pas de `components.json`. Tests → PASS.
- [ ] **Step 3: Vérifier** `pnpm nx run web-ui:build-storybook` et `pnpm check` → succès ; diff < 500 lignes.
- [ ] **Step 4: Commit** `feat(web-ui): add Button, Input, Label, Card and Dialog`.

### Task 4: `libs/web/data-access` — client HTTP (PR 3)

**Files:**

- Create: `libs/shared/contracts/src/lib/problem-details.ts` + `.spec.ts` ; export depuis `libs/shared/contracts/src/index.ts`
- Create: `libs/web/data-access/{project.json,tsconfig*.json,vitest.config.mts,.oxlintrc.json}` (tags `["scope:web", "type:data-access"]`, environnement `node`)
- Create: `libs/web/data-access/src/index.ts`, `src/lib/api-error.ts`, `src/lib/api-client.ts`, `src/lib/api-client.spec.ts`
- Modify: `tsconfig.base.json` (alias `@nx-react-nestjs/web-data-access`)

**Interfaces:**

- Produces (contracts) : `problemDetailsSchema` (zod : `type`, `title`, `status`, `detail`, `code` requis, `instance?`, `errors?: { path: string; message: string }[]`, `details?: Record<string, unknown>`) et `type ProblemDetails = z.infer<…>`. Il reflète l'interface de `libs/api/core/src/lib/errors/problem-details.filter.ts`, qui n'est pas modifiée.
- Produces (data-access) :
  - `class ApiError extends Error { readonly status: number; readonly code: string; readonly title: string; readonly detail: string; readonly requestId?: string; readonly errors?: { path: string; message: string }[] }`. Codes propres au client : `'TIMEOUT'` et `'NETWORK_ERROR'` (status `0`), `'HTTP_ERROR'` (réponse non problem+json), `'INVALID_RESPONSE'` (échec du schéma).
  - `interface ApiClientOptions { baseUrl: string; getToken?: () => string | undefined; timeoutMs?: number /* 10_000 */ }`
  - `interface ApiRequest<T> { method?: 'GET'|'POST'|'PUT'|'PATCH'|'DELETE'; query?: Record<string, string | number | undefined>; body?: unknown; schema?: z.ZodType<T>; idempotencyKey?: string; signal?: AbortSignal }`
  - `interface ApiClient { request<T>(path: string, init?: ApiRequest<T>): Promise<T> }` ; `createApiClient(options: ApiClientOptions): ApiClient`

- [ ] **Step 1: Test contracts** : `problemDetailsSchema` accepte un corps produit par `toProblem` (status 404, code `NOT_FOUND`) et rejette un objet sans `code`. FAIL, puis implémenter, puis PASS.
- [ ] **Step 2: Tests du client** (`api-client.spec.ts`, MSW `setupServer`, base `http://api.test/api/v1`), tous en échec au départ :
  - `returns the parsed body validated by the schema` ;
  - `sends Authorization only when getToken returns a value` ;
  - `sends a uuid x-request-id and exposes it on ApiError` (valeur relue depuis l'en-tête de la réponse si présent, sinon celle envoyée) ;
  - `sends Idempotency-Key when given` ;
  - `serialises query params, skipping undefined values` ;
  - `maps problem+json to ApiError` (404 → `status 404`, `code 'NOT_FOUND'`, `title`, `detail`) ;
  - `maps an empty or non-JSON error body to HTTP_ERROR` (502, corps vide ; 500, HTML) — Review Focus 2 ;
  - `throws INVALID_RESPONSE when the body fails the schema` ;
  - `returns undefined on 204` ;
  - `throws TIMEOUT after timeoutMs` (`timeoutMs: 50`, handler `delay('infinite')`) ;
  - `rethrows the caller AbortError untouched` (`signal` annulé pendant la requête → `error.name === 'AbortError'`, pas `ApiError`) — Review Focus 1 ;
  - `maps a network failure to NETWORK_ERROR` (`HttpResponse.error()`).
- [ ] **Step 3: Implémenter** `createApiClient` dans `api-client.ts`. Le signal combine l'appelant et `AbortSignal.timeout(timeoutMs)` via `AbortSignal.any`, et le timeout se reconnaît à `reason.name === 'TimeoutError'`. Le corps est envoyé en JSON (`content-type: application/json`) et l'en-tête `accept` vaut `application/json, application/problem+json`. Tests → PASS.
- [ ] **Step 4: Overrides oxlint** : dans `apps/web/.oxlintrc.json` et `libs/web/ui/.oxlintrc.json`, `"no-restricted-globals": ["error", { "name": "fetch", "message": "Passer par @nx-react-nestjs/web-data-access." }]`. Vérifier qu'un `fetch` ajouté temporairement dans `apps/web/src/main.tsx` fait échouer `pnpm nx lint web`, puis le retirer.
- [ ] **Step 5: Vérifier** `pnpm check` → succès.
- [ ] **Step 6: Commit** `feat(web-data-access): add typed HTTP client with problem details errors`.

### Task 5: `libs/web/data-access` — intégration TanStack Query (PR 3, suite)

**Files:**

- Create: `libs/web/data-access/src/lib/query-client.ts` + `.spec.ts`, `src/lib/use-idempotent-mutation.ts` + `.spec.tsx`
- Modify: `libs/web/data-access/src/index.ts`, `vitest.config.mts` (jsdom pour `*.spec.tsx`, ou tout le projet en jsdom)

**Interfaces:**

- Consumes: `ApiError` (tâche 4).
- Produces :
  - `createQueryClient(options?: { onMutationError?: (error: unknown) => void }): QueryClient`. Valeurs par défaut : `queries.staleTime: 30_000` ; `queries.retry` : pas de retry pour une `ApiError` de 400 à 499, sinon jusqu'à 3 essais ; `mutations.retry: 0`. Une `MutationCache` appelle `onMutationError` seulement si la mutation n'a pas d'`onError` propre et que l'erreur n'est pas une `AbortError`.
  - `useIdempotentMutation<TData, TInput>(options: Omit<UseMutationOptions<TData, unknown, IdempotentVariables<TInput>>, 'mutationFn'> & { mutationFn: (input: TInput, idempotencyKey: string) => Promise<TData> })` renvoie le résultat de `useMutation`, avec `mutate(input, opts?)` et `mutateAsync(input, opts?)` qui prennent `TInput`. `type IdempotentVariables<TInput> = { input: TInput; idempotencyKey: string }` ; la clé (`crypto.randomUUID()`) est créée à chaque `mutate`, et les retries réutilisent les mêmes variables. `retry` par défaut : 2 sur `NETWORK_ERROR`, `TIMEOUT` et status ≥ 500.
  - La convention `keys.ts` + `queryOptions` par ressource est documentée dans `libs/web/AGENTS.md` (tâche 8), sans helper dédié (YAGNI).

- [ ] **Step 1: Tests `query-client.spec.ts`** (en échec) :
  - `does not retry 4xx ApiError` (queryFn qui rejette une 404 → 1 appel ; `retryDelay: 0` passé à `fetchQuery`) ;
  - `retries 5xx up to 3 times` (4 appels au total) ;
  - `calls onMutationError for mutations without onError` et `does not call it when the mutation has its own onError` ;
  - `ignores AbortError` (mutation rejetée avec une `DOMException('…', 'AbortError')` → `onMutationError` non appelé).
- [ ] **Step 2: Implémenter** `createQueryClient`. Tests → PASS.
- [ ] **Step 3: Tests `use-idempotent-mutation.spec.tsx`** (en échec, `renderHook` + `QueryClientProvider`) :
  - `reuses the same key across retries` (échec 503 puis succès, `retryDelay: 0` → deux clés égales) ;
  - `uses a new key for each mutate call` ;
  - `does not retry a 409`.
- [ ] **Step 4: Implémenter** `useIdempotentMutation`. Tests → PASS. `pnpm check` → succès.
- [ ] **Step 5: Commit** `feat(web-data-access): add query client defaults and idempotent mutations`.

### Task 6: `apps/web` — routeur, providers, erreurs (PR 4)

**Files:**

- Create: `apps/web/src/router.tsx`, `src/api.ts`, `src/report-error.ts`, `src/components/error-zone.tsx`, `src/routes/__root.tsx`, `src/routes/index.tsx`, `src/routeTree.gen.ts` (généré, commité), `src/app.spec.tsx`
- Modify: `apps/web/src/main.tsx`, `apps/web/vite.config.mts`, `apps/web/project.json` (si une cible est nécessaire), `.oxlintrc.json` / `.prettierignore` (ignorer `routeTree.gen.ts`), `.env.example`
- Delete: `apps/web/src/app/`

**Interfaces:**

- Consumes: `createApiClient`, `createQueryClient` (tâches 4 et 5) ; `Stack`, `Heading`, `Text`, `Button` (tâches 2 et 3).
- Produces :
  - `api` (`src/api.ts`) = `createApiClient({ baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1', getToken: () => import.meta.env.VITE_DEV_TOKEN })`.
  - `createAppRouter(queryClient: QueryClient, history?: RouterHistory)`, avec un contexte de route `{ queryClient: QueryClient }` (`createRootRouteWithContext`), `defaultPreload: 'intent'`, et le module `Register` déclaré.
  - `reportError(error: unknown, info?: { componentStack?: string }): void` : `console.error` aujourd'hui, et le point d'accroche Sentry plus tard.
  - `ErrorZone({ children, fallback?: ReactNode })` : `ErrorBoundary` de react-error-boundary qui appelle `reportError`.
  - `__root.tsx` : layout (`Outlet` + `<Toaster />` de sonner), `errorComponent` (page d'erreur globale avec un bouton de réessai qui appelle `router.invalidate()`), `notFoundComponent` (404 avec un lien vers `/`).
  - `main.tsx` : `QueryClientProvider` (le `createQueryClient` reçoit `onMutationError: () => toast.error(…)`), puis `RouterProvider`.

- [ ] **Step 1: Plugin routeur** : `tanstackRouter({ target: 'react', autoCodeSplitting: true })` placé avant `react()`. `src/routeTree.gen.ts` est généré par `pnpm nx build web`, puis exclu du formatage (`.prettierignore`, lu par oxfmt) et du lint (`ignorePatterns`).
- [ ] **Step 2: Tests `app.spec.tsx`** (en échec) : `createAppRouter(createQueryClient(), createMemoryHistory({ initialEntries: [...] }))` est rendu avec les providers.
  - `renders the home page at /` (heading de niveau 1) ;
  - `renders the 404 page inside the layout for an unknown URL` (heading 404 et lien vers `/`) — Review Focus 5 ;
  - `renders the global error page when a route throws` (route de test ajoutée à l'arbre du test via `rootRoute.addChildren`, ou loader qui lève) ;
  - `ErrorZone shows its fallback and calls reportError` (`vi.spyOn(console, 'error')`).
- [ ] **Step 3: Implémenter** les fichiers listés. Pour l'instant, les textes sont en dur en français ; la tâche 7 les traduit. Tests → PASS.
- [ ] **Step 4: Env** : ajouter à `.env.example`, sous un commentaire, `VITE_API_URL=http://localhost:3000/api/v1` et `# VITE_DEV_TOKEN=` (avec `pnpm -s dev:token` en commentaire). Vérifier que `pnpm dev:setup` accepte ces clés. Déclarer `ImportMetaEnv` dans `src/vite-env.d.ts`.
- [ ] **Step 5: Vérifier** `pnpm nx build web`, `pnpm check` → succès. `pnpm nx serve web` : `/` et `/nope` s'affichent correctement, et le build contient au moins deux chunks de route.
- [ ] **Step 6: Commit** `feat(web): add TanStack Router with providers and error boundaries`.

### Task 7: Lingui et choix de la langue (PR 5)

**Files:**

- Create: `apps/web/lingui.config.ts`, `src/i18n/locale.ts` + `.spec.ts`, `src/i18n/i18n.ts`, `src/components/locale-switcher.tsx`, `src/locales/{fr,en}/messages.po` (générés)
- Modify: `apps/web/vite.config.mts`, `apps/web/project.json`, `apps/web/.oxlintrc.json`, `main.tsx`, routes, `app.spec.tsx`, `.github/workflows/ci.yml`

**Interfaces:**

- Produces :
  - `type Locale = 'fr' | 'en'` ; `SOURCE_LOCALE = 'fr'`, `LOCALES: readonly Locale[]`.
  - `resolveLocale(stored: string | null, navigatorLanguages: readonly string[]): Locale` : renvoie la valeur stockée si elle est valide, sinon la première langue du navigateur ramenée à sa langue de base et gérée, sinon `'fr'`.
  - `readStoredLocale(): string | null` et `storeLocale(locale: Locale): void`, sous la clé `localStorage` `'app.locale'`, avec try/catch.
  - `activateLocale(locale: Locale): Promise<void>` : import dynamique de `../locales/${locale}/messages.po`, `i18n.loadAndActivate`, puis `document.documentElement.lang = locale`.
  - `LocaleSwitcher()` : deux `Button` `fr` / `en` avec `aria-pressed`, placés dans le header du layout racine.
  - Cible Nx `web:i18n-check` : `lingui extract --clean` puis `git diff --exit-code -- apps/web/src/locales`.

- [ ] **Step 1: Tests `locale.spec.ts`** (en échec) :
  - `prefers a valid stored locale` ; `ignores an invalid stored value` ;
  - `maps en-US and fr-CA to their base locale` ; `falls back to fr for unsupported languages` (`['de-DE']`) — Review Focus 4 ;
  - `readStoredLocale returns null when localStorage throws` et `storeLocale does not throw` (`vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw … })`) — Review Focus 3.
- [ ] **Step 2: Implémenter** `locale.ts`. Tests → PASS.
- [ ] **Step 3: Brancher Lingui** : `lingui.config.ts` (`sourceLocale: 'fr'`, `locales: ['fr', 'en']`, format po, catalogues `<rootDir>/src/locales/{locale}/messages` avec `include` sur `src` et `../../libs/web`) ; `lingui()` de `@lingui/vite-plugin` ; `@lingui/babel-plugin-lingui-macro` dans les `plugins` de l'appel `babel()` existant. `main.tsx` attend `activateLocale(resolveLocale(readStoredLocale(), navigator.languages))` avant le rendu et enveloppe l'arbre dans `I18nProvider`.
- [ ] **Step 4: Traduire** tous les textes des routes, de la 404, de la page d'erreur et du toast (`Trans`, `useLingui().t`). Lancer `lingui extract` et remplir le catalogue `en`.
- [ ] **Step 5: Tests de l'app** : les tests de la tâche 6 activent `fr` avant le rendu. Ajouter `switching to en re-renders the home page in English and stores the choice`. Tests → PASS.
- [ ] **Step 6: Règle de lint** : charger `eslint-plugin-lingui` via `jsPlugins` dans `apps/web/.oxlintrc.json` et `libs/web/ui/.oxlintrc.json`, avec `lingui/no-unlocalized-strings: error` (ignorer `*.spec.tsx`, `*.stories.tsx`, `className` et les attributs non visibles). Vérifier qu'un `<p>Bonjour</p>` ajouté temporairement fait échouer `pnpm nx lint web`, puis le retirer. Si oxlint ne charge pas la règle, s'arrêter et le signaler plutôt que de basculer sur ESLint.
- [ ] **Step 7: CI** : ajouter la cible `i18n-check` à `nx affected -t …` dans `ci.yml`. Vérifier que `pnpm nx run web:i18n-check` passe, puis échoue si on ajoute un `Trans` sans relancer l'extraction.
- [ ] **Step 8: Commit** `feat(web): add Lingui i18n with browser locale detection`.

### Task 8: size-limit et documentation (PR 6)

**Files:**

- Create: `apps/web/.size-limit.json`, `apps/web/AGENTS.md`, `libs/web/AGENTS.md`
- Modify: `apps/web/project.json` (cible `size`, `dependsOn: ['build']`), `package.json` (`size-limit`, `@size-limit/file` : pas `preset-app`, qui lance un navigateur), `.github/workflows/ci.yml`, `AGENTS.md` (racine)

**Interfaces:**

- Produces : cible `web:size` (`size-limit`, cwd `apps/web`) sur `../../dist/apps/web/assets/*.js` avec la limite `initial JS (gzip)`.

- [ ] **Step 1: Mesurer** : `pnpm nx build web && npx size-limit --json` sans limite. Fixer la limite à environ +10 % de la valeur mesurée. `pnpm nx run web:size` → PASS ; avec une limite abaissée temporairement → FAIL.
- [ ] **Step 2: CI** : ajouter `size` à `nx affected -t …`.
- [ ] **Step 3: `apps/web/AGENTS.md`** : commandes (`pnpm nx serve web` → http://localhost:4200, `VITE_DEV_TOKEN=$(pnpm -s dev:token)`, `lingui extract`, `web:i18n-check`, `web:size`) ; rôle de l'app (assemblage, une route = un fichier dans `src/routes`) ; règles (aucune chaîne en dur, `useEffect` limité, erreurs via `ErrorZone`/`reportError`, toasts via sonner) ; feature flags à définir avec le premier écran métier.
- [ ] **Step 4: `libs/web/AGENTS.md`** : types de libs et frontières (`ui`, `data-access`, futur `feature` avec `components/ hooks/ data/ states/ index.ts`) ; design system (pas de `<div>` stylé pour la mise en page : `Stack`/`Text`/`Heading` ; ajout d'un composant shadcn par copie avec imports relatifs, plus une story) ; données (un `data/keys.ts` et une fabrique `queryOptions` par ressource, `staleTime` explicite, filtres et pagination dans les search params validés par zod, mutations POST idempotentes via `useIdempotentMutation`) ; formulaires (react-hook-form + `zodResolver` avec les schémas de contracts) ; état d'interface (`useState`, Jotai seulement si besoin) ; tests (Testing Library par rôle, MSW, stories exécutées comme tests).
- [ ] **Step 5: `AGENTS.md` racine** : lignes du tableau des commandes pour le front, structure (`libs/web/ui`, `libs/web/data-access`), tags (`scope:web` × `type:app|feature|ui|data-access`), lien vers les deux nouveaux AGENTS.md. Le principe 6 (feature flags) concerne l'API ; pour le front, voir `apps/web/AGENTS.md`.
- [ ] **Step 6: Vérifier** `pnpm check` → succès.
- [ ] **Step 7: Commit** `docs(web): document frontend conventions and add bundle size budget`.
