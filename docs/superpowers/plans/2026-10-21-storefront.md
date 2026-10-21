# Boutique (catalogue, panier, commande, annulation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un client parcourt le catalogue, remplit un panier persistant, passe sa commande, la retrouve et peut l'annuler, le tout derrière le flag `storefront`.

**Architecture:** Aucune route d'API nouvelle : l'API déclare seulement le flag. Le front lit les flags une fois (root `beforeLoad`), une nouvelle lib `libs/web/storefront` (`type:feature`) porte les écrans, l'état du panier (`localStorage` + `useSyncExternalStore`) et les `queryOptions` ; les fichiers de `apps/web/src/routes/` restent minces (garde de flag, `ErrorZone`, passage de `api`).

**Tech Stack:** React 19 + React Compiler, TanStack Router (routes fichier) / Query, Lingui, zod 4, Tailwind 4 + `@nx-react-nestjs/web-ui`, sonner, Vitest 5 + Testing Library + MSW 3.

**Spec:** [`docs/superpowers/specs/2026-10-21-storefront-design.md`](../specs/2026-10-21-storefront-design.md) — à lire avant toute tâche.

## Global Constraints

- Branche `feat/storefront`. Une PR par bloc (« PR 1 » à « PR 4 » ci-dessous), chacune < 500 lignes hors catalogues Lingui et `routeTree.gen.ts` ; scinder si dépassé.
- Commits en anglais (Conventional Commits), terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Aucune chaîne visible en dur dans le JSX (`<Trans>` / `t`) ; après chaque tâche qui ajoute du texte : `cd apps/web && pnpm exec lingui extract --clean`, traduire les nouvelles entrées dans `src/locales/en/messages.po`, committer les deux catalogues.
- Pas de `fetch` hors data-access, pas de `<div>` stylé (`Stack`/`Text`/`Heading`), tokens du thème seulement, pas de `useMemo`/`useCallback` réflexes, `useEffect` seulement pour se synchroniser avec l'extérieur.
- Tests avec MSW (`setupServer`, `server.listen({ onUnhandledFrame: 'error' })`), jamais de mock de `fetch`.
- `index.ts` : exports nommés uniquement. Pas d'import profond.
- Argent : entiers en unités mineures ; jamais de flottant dans un calcul (la division n'a lieu que pour l'affichage).
- Limites : `MAX_LINE_QUANTITY` (99) et `MAX_ORDER_LINES` (50) importées des contrats, jamais réécrites.
- URLs : `/`, `/panier`, `/commandes`, `/commandes/$orderId`.
- Libellés fixés par la spec : « Ajouter au panier », « ✓ {n} dans le panier », « Voir plus », « Mes commandes », « Panier ({n}) », « Ce produit n'est plus disponible », « Passer la commande », « Annuler la commande », « Annuler cette commande ? Cette action est définitive. », « Garder », « Oui, annuler », « Passée », « Annulée », « Aucun produit pour le moment », « Votre panier est vide », « Vous n'avez pas encore de commande », « Chargement… ».

## Review Focus

1. **Panier stocké corrompu, d'une version inconnue, ou `localStorage` qui lève (navigation privée)** : la page s'affiche avec un panier vide (ou en mémoire), sans planter. Tests : tâche 3.
2. **Devise sans décimales (XOF) et locale `en`** : `formatMoney({amountMinor: 1500, currency: 'XOF'}, 'fr')` affiche 1 500 F CFA, pas 15. Tests : tâche 3.
3. **Double clic sur « Passer la commande »** : une seule requête `POST /orders`. Test : tâche 6.
4. **URL `/commandes/ORD-…` d'une commande inconnue ou d'un autre client** (404 API) : page 404 de l'app, pas l'erreur globale. Test : tâche 8.
5. **Panier modifié dans un autre onglet** : le compteur et la page panier se mettent à jour (événement `storage`). Test : tâche 3.

---

## PR 1 : feature flags côté front

### Task 1: Flag `storefront` et `details` sur `ApiError`

**Files:**
- Modify: `libs/shared/contracts/src/lib/feature-flags.ts` (ajout dans `FEATURE_FLAGS`)
- Modify: `libs/web/data-access/src/lib/api-error.ts`, `libs/web/data-access/src/lib/api-client.ts` (`toApiError`)
- Modify: `.env.example:35` (commentaire)
- Test: `libs/web/data-access/src/lib/api-client.spec.ts`

**Interfaces:**
- Produces: `FeatureFlag` inclut `'storefront'` ; `ApiError.details?: Record<string, unknown>` ; `ApiErrorInit.details?: Record<string, unknown> | undefined`.

- [ ] **Step 1: Write the failing test** dans `api-client.spec.ts`

```ts
it('copies problem details onto ApiError', async () => {
  server.use(http.post(`${BASE}/orders`, () => HttpResponse.json(
    { type: 'urn:problem-type:PRODUCT_UNAVAILABLE', title: 'Unavailable', status: 422,
      detail: 'd', code: 'PRODUCT_UNAVAILABLE', details: { productIds: ['PRD-1'] } },
    { status: 422, headers: { 'content-type': 'application/problem+json' } })));
  const error = await api.request('/orders', { method: 'POST', body: {} }).catch((e) => e);
  expect(error).toBeInstanceOf(ApiError);
  expect(error.details).toEqual({ productIds: ['PRD-1'] });
});
```

- [ ] **Step 2: Run** `pnpm nx test web-data-access` — Expected: FAIL (`details` undefined).
- [ ] **Step 3: Implement** : `details` dans `ApiErrorInit`/`ApiError` (même motif que `errors` : assigné seulement si défini), recopié dans `toApiError` depuis `problem.data`. Ajouter à `FEATURE_FLAGS` :

```ts
storefront: {
  description: 'Boutique client : catalogue, panier, commandes.',
  default: false,
  client: true,
},
```

`.env.example` ligne 35 : `Ex. : orders.cancellation=false ; storefront=true pour la boutique en local`.
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck -p web-data-access contracts api-core` — Expected: PASS.
- [ ] **Step 5: Commit** `feat(contracts): declare storefront feature flag` puis `feat(web-data-access): expose problem details on ApiError` (deux commits).

### Task 2: Lecture des flags et garde de route

**Files:**
- Create: `libs/web/data-access/src/lib/feature-flags.ts`, `libs/web/data-access/src/lib/feature-flags.spec.ts`
- Modify: `libs/web/data-access/src/index.ts`
- Create: `apps/web/src/feature-flags.ts`
- Modify: `apps/web/src/routes/__root.tsx` (`beforeLoad`), `apps/web/src/app.spec.tsx` (MSW), `apps/web/AGENTS.md` (sections « Feature flags » et « Différé volontairement »)

**Interfaces:**
- Produces (data-access) :
  - `featureFlagsQueryOptions(api: ApiClient, onError?: (error: unknown) => void)` → `queryOptions` de clé `['feature-flags']`, `staleTime: Infinity`, `queryFn` qui appelle `GET /feature-flags` avec `featureFlagsResponseSchema` ; en cas d'échec (hors `AbortError`, qui est relancée), appelle `onError(error)` et renvoie `{ flags: {} }`.
  - `isFeatureEnabled(data: FeatureFlagsResponse, flag: FeatureFlag): boolean` → `data.flags[flag] === true`.
- Produces (app, `src/feature-flags.ts`) :
  - `requireFeature(flag: FeatureFlag)` → fonction `beforeLoad` `({ context }) => Promise<void>` qui fait `context.queryClient.ensureQueryData(featureFlagsQueryOptions(context.api, reportError))` et `throw notFound()` si le flag est faux.
  - `useFeatureFlag(flag: FeatureFlag): boolean` → `useSuspenseQuery(featureFlagsQueryOptions(api, reportError))` avec `api` lu par `useRouteContext({ from: '__root__' })`.
- Écart à la spec (assumé) : `useFeatureFlag` vit dans l'app et non dans data-access, car il a besoin de `api` (contexte du routeur) et de `reportError` (app). La lib storefront ne lit aucun flag : elle reçoit des booléens en props.

- [ ] **Step 1: Write the failing tests** (`feature-flags.spec.ts`, MSW, `createQueryClient().fetchQuery(...)`)
  - `returns the flags from the API` : handler `{ flags: { storefront: true } }` → `isFeatureEnabled(data, 'storefront') === true`.
  - `treats a missing flag as disabled` : `{ flags: {} }` → `isFeatureEnabled(data, 'orders.cancellation') === false`.
  - `falls back to all flags off and reports when the call fails` : handler 500 → données `{ flags: {} }`, `onError` appelé une fois avec une `ApiError`.
- [ ] **Step 2: Run** `pnpm nx test web-data-access` — Expected: FAIL (module absent).
- [ ] **Step 3: Implement** `feature-flags.ts` (data-access) et l'export ; puis `apps/web/src/feature-flags.ts` ; `__root.tsx` : `beforeLoad: ({ context }) => context.queryClient.ensureQueryData(featureFlagsQueryOptions(context.api, reportError))` (les flags sont chargés une fois avant le premier rendu).
- [ ] **Step 4: Adapter `app.spec.tsx`** : `setupServer` avec un handler `GET http://localhost:3000/api/v1/feature-flags` → `{ flags: {} }` par défaut ; test ajouté `renders the home page when the flags call fails` (handler 500 → titre « Boilerplate web »).
- [ ] **Step 5: Run** `pnpm nx run-many -t test typecheck lint -p web web-data-access` — Expected: PASS.
- [ ] **Step 6: Docs** : `apps/web/AGENTS.md`, remplacer la section « Feature flags » par le mécanisme (déclaration `client: true` dans les contrats, root `beforeLoad`, `requireFeature` pour une route, `useFeatureFlag` dans un composant de l'app, props booléennes vers les libs, repli « tout coupé » en cas d'échec, `FEATURE_FLAGS=storefront=true` en local) ; retirer « feature flags » de « Différé volontairement ».
- [ ] **Step 7: Commit** `feat(web): read feature flags once and guard routes`.

---

## PR 2 : lib storefront, panier, catalogue

### Task 3: Lib `web-storefront`, `formatMoney` et état du panier

**Files:**
- Create: `libs/web/storefront/{project.json,tsconfig.json,tsconfig.lib.json,tsconfig.spec.json,vitest.config.mts,.oxlintrc.json}`, `src/index.ts`, `src/test-setup.ts`
- Create: `src/lib/data/format-money.ts` (+ `.spec.ts`), `src/lib/states/cart.ts` (+ `.spec.ts`)
- Modify: `tsconfig.base.json` (paths), `knip` config si les libs y sont listées

**Interfaces:**
- Produces :
  - Projet Nx `web-storefront`, tags `["scope:web", "type:feature"]`, alias `@nx-react-nestjs/web-storefront` → `libs/web/storefront/src/index.ts`. Config copiée de `libs/web/ui` (tsconfig, cible `typecheck`), `vitest.config.mts` en `jsdom` avec les plugins de `apps/web/vite.config.mts` (`react()`, `babel({ plugins: ['@lingui/babel-plugin-lingui-macro'], presets: [reactCompilerPreset()] })`, `lingui()`), `test-setup.ts` = `import '@testing-library/jest-dom/vitest'`. `.oxlintrc.json` = `{ "extends": ["../.oxlintrc.web.json"] }`.
  - `formatMoney(money: Money, locale: string): string`.
  - `CART_STORAGE_KEY = 'app.cart'`, `type CartLine = { productId: string; name: string; quantity: number }`.
  - `useCart(): readonly CartLine[]` ; `cartCount(lines): number` (somme des quantités) ; `canAddToCart(lines, productId): boolean` (faux si quantité déjà à `MAX_LINE_QUANTITY`, ou produit absent et `MAX_ORDER_LINES` lignes atteintes) ; `addToCart(product: { id: string; name: string }): void` (cumule +1, plafonné) ; `setCartQuantity(productId: string, quantity: number): void` (borné 1..99) ; `removeFromCart(productId: string): void` ; `clearCart(): void`.
- Stockage : `{ version: 1, lines: CartLine[] }` validé par zod à la lecture ; absent, invalide ou version ≠ 1 → `[]`. Écritures et lectures sous try/catch ; si `localStorage` lève, l'état reste en mémoire pour la session. `useSyncExternalStore` : `subscribe` écoute les écritures locales et `window` `storage` (clé `app.cart`) ; le snapshot est mis en cache par chaîne brute (même référence tant que le contenu ne change pas).

- [ ] **Step 1: Write the failing tests**
  - `format-money.spec.ts` : `formatMoney({amountMinor: 1990, currency: 'EUR'}, 'fr')` → contient `19,90` et `€` ; `'en'` → contient `19.90` ; `{amountMinor: 1500, currency: 'XOF'}`, `'fr'` → contient `1` `500` et pas `15,00` (comparer après normalisation des espaces insécables : `.replace(/\s/g, ' ')`).
  - `cart.spec.ts` (`renderHook(() => useCart())`, `localStorage.clear()` avant chaque test) :
    - `adds a product then increments its quantity` → une ligne, `quantity: 2`, `name` conservé.
    - `caps a line at MAX_LINE_QUANTITY` ; `canAddToCart` faux à 99.
    - `refuses a new product once MAX_ORDER_LINES lines exist` (`canAddToCart` faux, `addToCart` sans effet).
    - `persists across reloads` : après `addToCart`, `JSON.parse(localStorage.getItem('app.cart'))` vaut `{ version: 1, lines: [...] }` ; un nouveau `renderHook` lit la même ligne.
    - `starts empty when stored content is corrupted` (`'{oops'`) et `when stored version is unknown` (`{ version: 2, lines: [] }`).
    - `keeps working in memory when localStorage throws` (`vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error() })` → `addToCart` met à jour `useCart`).
    - `follows changes made in another tab` : écrire la clé puis `window.dispatchEvent(new StorageEvent('storage', { key: 'app.cart' }))` → `useCart` reflète le nouveau contenu.
    - `clearCart empties the cart`, `removeFromCart removes one line`, `setCartQuantity clamps to 1..99`.
- [ ] **Step 2: Run** `pnpm nx test web-storefront` — Expected: FAIL (modules absents).
- [ ] **Step 3: Implement** ; `formatMoney` : `Intl.NumberFormat(locale, { style: 'currency', currency })`, diviseur `10 ** resolvedOptions().maximumFractionDigits`.
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck lint -p web-storefront` puis `pnpm knip` — Expected: PASS (exports non encore consommés : les exporter depuis `index.ts` seulement à la tâche 4 si knip se plaint).
- [ ] **Step 5: Commit** `feat(web-storefront): add storefront lib with persistent cart`.

### Task 4: Catalogue et en-tête

**Files:**
- Create: `libs/web/storefront/src/lib/data/keys.ts`, `src/lib/data/products.ts`, `src/lib/components/catalog-page.tsx` (+ `.spec.tsx`), `src/lib/components/storefront-nav.tsx`
- Modify: `libs/web/storefront/src/index.ts`, `apps/web/src/routes/index.tsx`, `apps/web/src/routes/__root.tsx` (nav dans le `header`), `apps/web/src/app.spec.tsx`

**Interfaces:**
- Consumes : `useCart`, `addToCart`, `canAddToCart`, `cartCount`, `formatMoney` (tâche 3) ; `useFeatureFlag` (tâche 2).
- Produces :
  - `storefrontKeys = { products: () => ['catalog', 'products'] as const, product: (id: string) => ['catalog', 'products', id] as const, orders: () => ['orders'] as const, order: (id: string) => ['orders', id] as const }`.
  - `PAGE_SIZE = 20` ; `productsInfiniteQueryOptions(api: ApiClient)` (`GET /catalog/products?limit=20&cursor=…`, `productPageSchema`, `staleTime: 30_000`, `getNextPageParam: (p) => p.nextCursor ?? undefined`) ; `productQueryOptions(api: ApiClient, id: string)` (`GET /catalog/products/:id`, `productSchema`, `staleTime: 30_000`).
  - `<CatalogPage api={api} />` ; `<StorefrontNav />` (liens « Mes commandes » → `/commandes`, « Panier ({n}) » → `/panier`).
  - `apps/web/src/routes/index.tsx` : `useFeatureFlag('storefront')` ? `<ErrorZone><CatalogPage api={api} /></ErrorZone>` : le titre actuel « Boilerplate web ». `api` via `Route.useRouteContext()`.
  - `__root.tsx` : `<StorefrontNav />` rendu dans le `header` si `useFeatureFlag('storefront')`.

- [ ] **Step 1: Write the failing tests** (`catalog-page.spec.tsx`, MSW, rendu dans `I18nProvider` + `QueryClientProvider`, `i18n.activate('fr')` avec catalogue vide : les messages source s'affichent)
  - `lists products with name, sku and price` : page de 2 produits `active` → « Tee-shirt blanc (M) », « TEE-WHITE-M », texte contenant `19,90`.
  - `loads the next page with Voir plus` : 1re réponse `nextCursor: 'c1'`, 2e (`cursor=c1`) `nextCursor: null` → les produits des deux pages sont visibles, le bouton « Voir plus » disparaît.
  - `adds to cart and shows the count on the card` : 2 clics « Ajouter au panier » → « ✓ 2 dans le panier » ; `localStorage` contient la ligne avec le `name`.
  - `shows the empty state` : `items: []` → « Aucun produit pour le moment ».
  - Dans `app.spec.tsx` : `shows the catalog and the cart link when storefront is on` (flags `{ storefront: true }`, produits mockés → lien « Panier (0) » et « Mes commandes ») ; le test « Boilerplate web » reste avec flags `{}`.
- [ ] **Step 2: Run** `pnpm nx run-many -t test -p web-storefront web` — Expected: FAIL.
- [ ] **Step 3: Implement** (grille de `Card` via `Stack`, `useInfiniteQuery`, `Link` de `@tanstack/react-router` pour la nav, « Chargement… » pendant le premier chargement, bouton « Ajouter » `disabled` si `!canAddToCart`).
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck lint -p web-storefront web` puis extraction Lingui — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-storefront): show the catalog and cart count`.

---

## PR 3 : panier et commande

### Task 5: Page panier

**Files:**
- Create: `libs/web/storefront/src/lib/components/cart-page.tsx` (+ `.spec.tsx`), `src/lib/hooks/use-cart-lines.ts`
- Create: `apps/web/src/routes/panier.tsx`
- Modify: `libs/web/storefront/src/index.ts`

**Interfaces:**
- Consumes : `productQueryOptions`, `useCart`, `setCartQuantity`, `removeFromCart`, `formatMoney`, `requireFeature`.
- Produces :
  - `useCartLines(api: ApiClient)` → `{ lines: Array<CartLine & { product?: ProductResponse; unavailable: boolean; loading: boolean }>; total?: Money; mixedCurrencies: boolean; canOrder: boolean }`. `useQueries` sur `productQueryOptions` ; `unavailable` = erreur `ApiError` de status 404 ; `total` = somme des `price.amountMinor * quantity` des lignes disponibles si une seule devise ; `canOrder` = au moins une ligne, aucune `unavailable`, aucune en chargement, pas de devises mélangées.
  - `<CartPage api={api} />`. Route `apps/web/src/routes/panier.tsx` : `beforeLoad: requireFeature('storefront')`, composant `<ErrorZone><CartPage api={api} /></ErrorZone>`.

- [ ] **Step 1: Write the failing tests** (`cart-page.spec.tsx`, panier pré-rempli dans `localStorage`)
  - `shows current catalog prices, not stored ones` : ligne `{productId: 'PRD-…A', name: 'Ancien nom', quantity: 2}`, API renvoie nom « Tee-shirt noir (L) » prix 2190 → « Tee-shirt noir (L) », sous-total contenant `43,80`, total `43,80`.
  - `greys out an unavailable product and blocks the order` : API 404 → ligne nommée « Sweat gris » (nom stocké) + « Ce produit n'est plus disponible » ; bouton « Passer la commande » `disabled` ; après « Retirer », bouton actif.
  - `changes quantity with the stepper` : « + » → `quantity: 3` en `localStorage`, « − » à 1 désactivé.
  - `blocks mixed currencies` : un produit EUR, un XOF → message et bouton désactivé.
  - `shows the empty state with a link to the catalog` : « Votre panier est vide ».
- [ ] **Step 2: Run** `pnpm nx test web-storefront` — Expected: FAIL.
- [ ] **Step 3: Implement** (stepper : deux `Button size="icon"` avec `aria-label` traduits, quantité en `Text`).
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck lint -p web-storefront web` + extraction Lingui — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-storefront): add cart page with live prices`.

### Task 6: Passer la commande

**Files:**
- Create: `libs/web/storefront/src/lib/data/orders.ts`, `src/lib/hooks/use-place-order.ts`
- Modify: `src/lib/components/cart-page.tsx` (+ `.spec.tsx`)

**Interfaces:**
- Consumes : `useIdempotentMutation`, `clearCart`, `storefrontKeys`, `ApiError.details` (tâche 1).
- Produces :
  - `placeOrder(api: ApiClient, input: PlaceOrderInput, idempotencyKey: string): Promise<OrderResponse>` (`POST /orders`, `orderSchema`).
  - `orderQueryOptions(api, id)` (`GET /orders/:id`, `orderSchema`, `staleTime: 30_000`) et `ordersInfiniteQueryOptions(api)` (`GET /orders`, `orderPageSchema`, page de 20) — définies ici, utilisées aux tâches 7 et 8.
  - `usePlaceOrder(api: ApiClient)` → résultat de `useIdempotentMutation` ; `onSuccess(order)` : `clearCart()`, `queryClient.setQueryData(storefrontKeys.order(order.id), order)`, `invalidateQueries({ queryKey: storefrontKeys.orders() })`, `navigate({ to: '/commandes/$orderId', params: { orderId: order.id } })`. `onError` (option du hook, donc pas de toast global) : `PRODUCT_UNAVAILABLE` → `invalidateQueries` des `storefrontKeys.product(id)` de `details.productIds` et message inline « Certains produits ne sont plus disponibles. » ; sinon `toast.error(t\`Une erreur est survenue.\`)` (sonner).

- [ ] **Step 1: Write the failing tests** (dans `cart-page.spec.tsx`, router mémoire minimal avec une route `/commandes/$orderId` qui affiche l'ID)
  - `places the order, empties the cart and opens the summary` : `POST /orders` reçoit `{ lines: [{ productId, quantity: 2 }] }` et un en-tête `idempotency-key` → `localStorage` sans ligne, URL `/commandes/ORD-…`.
  - `sends a single order on double click` : deux clics rapides → handler appelé une fois (bouton `disabled` pendant `isPending`).
  - `marks products unavailable when the API refuses them` : `POST` 422 `PRODUCT_UNAVAILABLE` `details.productIds: [idA]`, puis `GET` du produit A → 404 → message inline et ligne A « Ce produit n'est plus disponible ».
- [ ] **Step 2: Run** `pnpm nx test web-storefront` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck lint -p web-storefront web` + extraction Lingui — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-storefront): place an order from the cart`.

---

## PR 4 : commandes et annulation

### Task 7: Composant `Badge`

**Files:**
- Create: `libs/web/ui/src/lib/components/badge.tsx`, `badge.stories.tsx`
- Modify: `libs/web/ui/src/index.ts`

**Interfaces:**
- Produces : `Badge` (shadcn, `cva`, variants `default | secondary | destructive | outline`), `BadgeProps` ; export `{ Badge, badgeVariants, type BadgeProps }`.

- [ ] **Step 1:** Copier le composant shadcn `badge` (imports relatifs, `cn` local), une story par variant. Le test vient de `stories.spec.tsx` (toutes les stories rendues).
- [ ] **Step 2: Run** `pnpm nx run-many -t test typecheck lint -p web-ui` — Expected: PASS avec les nouvelles stories.
- [ ] **Step 3: Commit** `feat(web-ui): add Badge`.

### Task 8: Récapitulatif et annulation

**Files:**
- Create: `libs/web/storefront/src/lib/components/order-page.tsx` (+ `.spec.tsx`), `src/lib/components/order-status-badge.tsx`, `src/lib/hooks/use-cancel-order.ts`
- Create: `apps/web/src/routes/commandes.$orderId.tsx`
- Modify: `libs/web/storefront/src/index.ts`, `src/lib/data/orders.ts`

**Interfaces:**
- Consumes : `orderQueryOptions`, `storefrontKeys`, `Badge`, `Dialog*`, `useFeatureFlag`, `requireFeature`.
- Produces :
  - `cancelOrder(api, id): Promise<OrderResponse>` (`POST /orders/:id/cancel`, `orderSchema`).
  - `useCancelOrder(api)` : `useMutation` simple ; `onSuccess(order)` → `setQueryData(order(id))` + invalidation de `orders()` ; `onError` : `ORDER_VERSION_CONFLICT` → `invalidateQueries(order(id))` + `toast.error(t\`La commande a changé entre-temps, elle a été rechargée.\`)`, sinon toast générique.
  - `<OrderStatusBadge status={OrderStatus} />` (« Passée » `default`, « Annulée » `secondary`).
  - `<OrderPage api={api} orderId={string} canCancel={boolean} />`.
  - Route : `beforeLoad: requireFeature('storefront')` ; `loader` : `ensureQueryData(orderQueryOptions(api, orderId))`, `ApiError` 404 → `throw notFound()` ; composant : `<ErrorZone><OrderPage … canCancel={useFeatureFlag('orders.cancellation')} /></ErrorZone>`.

- [ ] **Step 1: Write the failing tests** (`order-page.spec.tsx`)
  - `shows the order summary with frozen prices` : commande `placed`, 2 lignes → « Passée », « 2 × 21,90 € » (normaliser les espaces), total `55,80`, date formatée.
  - `cancels after confirmation` : clic « Annuler la commande » → dialogue « Annuler cette commande ? Cette action est définitive. » → « Oui, annuler » → `POST /orders/:id/cancel` appelé, badge « Annulée », bouton absent.
  - `keeps the order when the user backs out` : « Garder » → aucun `POST`.
  - `hides cancel when the flag is off` (`canCancel={false}`) et `when the order is already cancelled`.
  - Dans `app.spec.tsx` : `shows the 404 page for an unknown order` (flags `{ storefront: true }`, `GET /orders/ORD-x` 404 → « 404 : page introuvable ») et `shows the 404 page on /panier when storefront is off`.
- [ ] **Step 2: Run** `pnpm nx run-many -t test -p web-storefront web` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck lint -p web-storefront web` + extraction Lingui — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-storefront): show order summary and cancel it`.

### Task 9: Mes commandes

**Files:**
- Create: `libs/web/storefront/src/lib/components/orders-page.tsx` (+ `.spec.tsx`)
- Create: `apps/web/src/routes/commandes.index.tsx`
- Modify: `libs/web/storefront/src/index.ts`

**Interfaces:**
- Consumes : `ordersInfiniteQueryOptions`, `OrderStatusBadge`, `formatMoney`.
- Produces : `<OrdersPage api={api} />` ; route `/commandes` avec `requireFeature('storefront')` et `ErrorZone`.

- [ ] **Step 1: Write the failing tests** : `lists orders with id, date, status and total, each linking to its summary` (lien `href` `/commandes/ORD-…`) ; `loads more with Voir plus` ; `shows the empty state` (« Vous n'avez pas encore de commande »).
- [ ] **Step 2: Run** `pnpm nx test web-storefront` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `pnpm nx run-many -t test typecheck lint -p web-storefront web` + extraction Lingui — Expected: PASS.
- [ ] **Step 5: Commit** `feat(web-storefront): list customer orders`.

### Task 10: Vérification finale

- [ ] **Step 1:** `pnpm check` — Expected: tout vert (format, lint, types, tests, knip, `web:i18n-check`).
- [ ] **Step 2:** `pnpm nx build web && pnpm nx run web:size` — Expected: sous 170 kB ; les routes boutique sont dans des chunks séparés.
- [ ] **Step 3: Parcours manuel** (section « Vérification manuelle » de la spec) : `.env` avec `FEATURE_FLAGS=storefront=true`, API + `pnpm dev:seed` + front avec `VITE_DEV_TOKEN`. Ajouter 2 tee-shirts noirs et 1 mug, recharger (panier intact), commander, annuler, retrouver la commande « Annulée » dans « Mes commandes » ; retirer le flag → `/panier` en 404, accueil « Boilerplate web ». Capturer le résultat (skill `run` ou captures).
- [ ] **Step 4:** Ouvrir les PR (une par bloc) si l'utilisateur le demande.
