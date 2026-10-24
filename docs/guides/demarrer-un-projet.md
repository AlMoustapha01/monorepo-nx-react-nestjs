# Démarrer un projet depuis le boilerplate

Deux étapes, à des moments différents :

1. **Renommer le scope** (`@nx-react-nestjs` → `@<votre-scope>`) : tout de suite, avant d'écrire du code.
2. **Retirer les exemples** (`catalog`, `orders`, `notifications`, la boutique) : une fois votre premier domaine écrit, puisqu'ils servent de modèles, mais **avant le premier déploiement**, tant que les migrations peuvent être régénérées.

Les exemples de code ci-dessous utilisent le scope `@acme`. Ces étapes ont été déroulées de bout en bout sur une copie du repo : après chacune, `pnpm check`, le build, `web:i18n-check` et les parcours Playwright passent.

## 1. Renommer le scope

Juste après le clone, sur un arbre git propre :

```sh
pnpm install
pnpm init:project acme
git diff && pnpm check
```

`init:project` remplace le scope `@nx-react-nestjs` par `@acme` (alias de `tsconfig.base.json`, imports, nom du `package.json` racine, messages de lint, doc) et renomme le projet et les images de `docker-compose.prod.yml` (`acme-api`…), puis reformate (des imports plus courts changent le découpage des lignes) et vide le cache de Nx. Il refuse un arbre modifié, pour que `git diff` montre exactement le renommage, et un second passage.

Rien d'autre à changer : ni le lockfile, ni les noms de projets Nx (`api`, `web`, `api-core`… n'ont pas de scope), ni le Dockerfile, la CI, les configs Vite, Vitest et Lingui ou les catalogues `.po`.

À adapter à la main selon le produit : `MAIL_FROM` dans `.env.example`, les comptes et l'organisation de démo (`tools/dev`), l'utilisateur et la base Postgres `app`, le titre du README, les propriétaires de `.github/CODEOWNERS` (`@AlMoustapha01` → votre équipe), l'index des exigences si le produit a un cahier des charges (`specs/product-requirements.json`, voir [Spec Kit](spec-kit.md#index-des-exigences)), et `author` et `repository` dans `tools/spec-kit/preset/preset.yml` (puis `specify preset update`, voir [Spec Kit](spec-kit.md#personnaliser-les-templates-ou-les-règles-tdd)).

## 2. Retirer les exemples

Une fois votre premier domaine écrit, et avant le premier déploiement, sur un arbre git propre :

```sh
pnpm strip:examples
git diff && pnpm check
```

Le script :

- supprime les fichiers propres aux exemples (liste `EXAMPLE_PATHS` de `tools/dev/strip-examples-core.mts` : domaines, contrats, tests, lib et routes de la boutique) et, dans les fichiers partagés, les lignes entre `example:start` et `example:end` (modules de l'API, exports des contrats, flags d'exemple, produits du seed, navigation du front, doc). Un marqueur mal formé arrête tout avant le moindre changement. Il retire aussi de `tsconfig.base.json` les alias devenus sans cible ;
- repart d'une migration unique, `0000_init.sql` (tables de core et de vos domaines), régénère `routeTree.gen.ts` (build du front) et les catalogues Lingui, reformate et vide le cache de Nx ;
- liste les mentions des exemples qui restent : des règles générales illustrées par eux (`orders` → `ProductCatalog` → `CatalogFacade`, préfixes `PRD-`/`ORD-` dans `AGENTS.md`), des données de test. À relire et à remplacer par vos propres domaines.

Il refuse un second passage. Ensuite : retirer `FEATURE_FLAGS=storefront=true` de votre `.env` (un flag inconnu empêche l'API de démarrer), puis `pnpm dev:down -v && pnpm dev:setup` pour une base locale neuve.

**Projet déjà déployé** : `pnpm strip:examples --keep-migrations`. Ne jamais supprimer ni réécrire une migration appliquée : retirer le code, déployer, puis générer une migration qui supprime les tables (`pnpm nx run api:db-generate --name=drop-examples`). drizzle-kit ne génère pas le `DROP SCHEMA` d'un `pgSchema` disparu : relire le SQL produit.

**Nouvel exemple** : dans ses propres fichiers, ajoutés à `EXAMPLE_PATHS`, ou entre des marqueurs sur des lignes entières : `// example:start` et `// example:end` (`{/* example:start */}` en JSX), `# example:start` (`.env.example`, YAML), `<!-- example:start -->` (Markdown). Le job `strip-examples` de la CI lance le script puis `pnpm check`.
