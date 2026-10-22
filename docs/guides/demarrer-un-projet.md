# Démarrer un projet depuis le boilerplate

Deux étapes, à des moments différents :

1. **Renommer le scope** (`@nx-react-nestjs` → `@<votre-scope>`) : tout de suite, avant d'écrire du code.
2. **Retirer les exemples** (`catalog`, `orders`, `notifications`, la boutique) : une fois votre premier domaine écrit, puisqu'ils servent de modèles, mais **avant le premier déploiement**, tant que les migrations peuvent être régénérées.

Les exemples de code ci-dessous utilisent le scope `@acme`. Ces étapes ont été déroulées de bout en bout sur une copie du repo : après chacune, `pnpm check`, le build, `web:i18n-check` et les parcours Playwright passent.

## 1. Renommer le scope

Depuis la racine, ici avec le scope `acme` (macOS ; sous Linux, `sed -i` sans `''`) :

```sh
git grep -lz '@nx-react-nestjs/' | xargs -0 sed -i '' -e 's#@nx-react-nestjs/#@acme/#g'
sed -i '' -e 's#nx-react-nestjs-#acme-#g' docker-compose.prod.yml
pnpm format
pnpm nx reset && pnpm install
pnpm check
```

- La première commande couvre les alias de `tsconfig.base.json`, tous les imports, le nom du `package.json` racine, les messages de lint et la doc. La seconde renomme le projet et les images de `docker-compose.prod.yml`.
- `pnpm format` est nécessaire : des imports plus courts changent le découpage des lignes, et `oxfmt --check` échouerait.
- `pnpm nx reset` vide le graphe de projets en cache, qui garde les anciens alias.
- Rien à changer dans le lockfile, les noms de projets Nx (`api`, `web`, `api-core`… n'ont pas de scope), le Dockerfile, la CI, les configs Vite, Vitest et Lingui ni les catalogues `.po`.

À adapter à la main selon le produit : `MAIL_FROM` dans `.env.example`, les comptes et l'organisation de démo (`tools/dev`), l'utilisateur et la base Postgres `app`, et `author` dans `tools/spec-kit/preset/preset.yml` (puis `specify preset update`, voir [Spec Kit](spec-kit.md#personnaliser-les-templates-ou-les-règles-tdd)).

## 2. Retirer les exemples

> Avant de commencer : retirez `FEATURE_FLAGS=storefront=true` de votre `.env`. Un flag inconnu empêche l'API de démarrer.

### Supprimer

```sh
rm -r libs/api/catalog libs/api/orders libs/api/notifications \
  libs/web/storefront \
  libs/shared/contracts/src/lib/catalog libs/shared/contracts/src/lib/orders \
  apps/api/tests/{catalog,orders,notifications}.e2e.spec.ts \
  apps/web/src/routes/_authenticated/{panier.tsx,commandes.index.tsx,'commandes.$orderId.tsx'} \
  apps/api/migrations
```

### Modifier

**API et contrats**

- `tsconfig.base.json` : retirer les alias `api-catalog`, `api-orders`, `api-notifications` et `web-storefront`.
- `libs/shared/contracts/src/index.ts` : retirer les exports de `catalog/product`, `orders/order` et `orders/order.events`.
- `apps/api/src/app/app.module.ts` : `imports: [CoreModule]`.
- `apps/api/tests/rate-limit.e2e.spec.ts` : remplacer `/api/v1/catalog/products` par `/api/v1/feature-flags` (route authentifiée de core).

**Feature flags.** Le catalogue `FEATURE_FLAGS` ne contient que des flags d'exemple et peut rester vide, mais `FeatureFlag` devient alors `never` et `FEATURE_FLAGS[flag].default` ne compile plus. Dans `libs/shared/contracts/src/lib/feature-flags.ts` :

```ts
export const FEATURE_FLAGS = {} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/** Définition d'un flag. Typée explicitement : le catalogue peut être vide (`FeatureFlag` = `never`). */
export function featureFlagDefinition(flag: FeatureFlag): FeatureFlagDefinition {
  return FEATURE_FLAGS[flag];
}
```

Puis, dans api-core, remplacer `FEATURE_FLAGS[flag].default` par `featureFlagDefinition(flag).default` (`feature-flags.ts`, `testing.ts`) et `FEATURE_FLAGS[flag].client` par `featureFlagDefinition(flag).client` (`feature-flags.controller.ts`). Les tests qui citaient les flags d'exemple :

- `libs/api/core/src/lib/feature-flags/feature-flags.spec.ts` : `vi.mock('@acme/contracts')` avec un catalogue de test (`test.on`, `test.off`) ;
- `libs/web/data-access/src/lib/feature-flags.spec.ts` et `apps/web/src/feature-flags.spec.tsx` : `const FLAG = 'demo' as unknown as FeatureFlag`.

**Front**

- `apps/web/src/components/app-navigation.tsx` : retirer `StorefrontNav`, `useFeatureFlag('storefront')` et leurs imports.
- `apps/web/src/routes/_authenticated/index.tsx` : une page d'accueil provisoire.

  ```tsx
  import { Trans } from '@lingui/react/macro';
  import { createFileRoute } from '@tanstack/react-router';
  import { Heading } from '@acme/web-ui';

  function Home() {
    return (
      <Heading level={1}>
        <Trans>Accueil</Trans>
      </Heading>
    );
  }

  export const Route = createFileRoute('/_authenticated/')({ component: Home });
  ```

- `apps/web/src/app.spec.tsx` : retirer les tests de la boutique, des commandes et du panier ; le titre attendu devient `Accueil` (`Home` en anglais) ; le test de redirection après connexion vise `/?onglet=2`. Le test « recharge les données du nouveau tenant » n'a plus rien à observer : le remettre avec le premier écran métier.

**Parcours navigateur** (`apps/web-e2e/src`)

- `stack.ts` : retirer `FEATURE_FLAGS: 'storefront=true'` (sinon l'API ne démarre pas).
- `support.ts` : retirer `publishProduct`.
- `sign-in.spec.ts`, `sign-up.spec.ts`, `invitation.spec.ts`, `password-reset.spec.ts`, `accessibility.spec.ts` : attendre le titre `Accueil` sur `/` au lieu des pages de la boutique.

**Outillage**

- `tools/dev/seed.mts` : retirer les produits ; le script ne crée plus que l'organisation et les comptes de démo (avec le service d'auth). Y ajouter ensuite les données de démo du projet, par l'API.
- `tools/dev/dev-env.mts` : supprimer `apiBaseUrl()`, devenu inutilisé (knip).
- `libs/api/core/src/lib/http/idempotency/idempotency.interceptor.ts` : `IdempotentOptions` n'est plus importée ailleurs, retirer son `export` (knip).
- `.env.example` et `libs/api/core/src/lib/config/env.ts` : remplacer l'exemple `orders.cancellation=false` de `FEATURE_FLAGS`.

**Fichiers générés**

```sh
pnpm nx run web:build                               # régénère routeTree.gen.ts
(cd apps/web && pnpm exec lingui extract --clean)   # retire les chaînes de la boutique
```

Puis traduire `Accueil` dans `apps/web/src/locales/en/messages.po` (`msgstr "Home"`).

### Régénérer les migrations

Un projet jamais déployé repart d'une migration unique :

```sh
pnpm nx run api:db-generate --name=init   # sans base de données
docker compose down -v && pnpm dev:setup  # base locale neuve
```

`0000_init.sql` contient les tables de core (`messaging.outbox`, `messaging.processed_events`, `idempotency.keys`) et celles de vos domaines. Aucun code ne dépend des noms de migrations.

**Projet déjà déployé** : ne jamais supprimer ni réécrire une migration appliquée. Retirer d'abord le code qui utilise les tables, déployer, puis générer une migration qui les supprime. drizzle-kit ne génère pas le `DROP SCHEMA` d'un `pgSchema` disparu : relire le SQL produit.

### Mettre la doc à jour

Ces passages citent les exemples et deviennent faux :

- `AGENTS.md` : « Domaines d'exemple à copier », l'exemple `orders` → `ProductCatalog` → `CatalogFacade`, « Règles actuelles » (Autorisations), « le catalogue écoute les commandes » (Événements), la mention du code existant sans spec (Spec Kit), les préfixes `PRD-`/`ORD-` et l'exemple `orders.cancellation` (Conventions) ;
- `apps/web/AGENTS.md` : `FEATURE_FLAGS=storefront=true` et `publishProduct` ;
- `libs/web/AGENTS.md` : l'exemple `web-storefront` ;
- les commentaires d'en-tête de `tools/dev/token.mts` et `tools/dev/dev-env.mts`.

### Vérifier

```sh
pnpm format && pnpm check
pnpm nx run-many -t build
pnpm nx run web:i18n-check
pnpm nx run web-e2e:e2e
```
