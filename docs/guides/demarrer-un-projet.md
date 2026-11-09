# Démarrer un projet depuis le boilerplate

Deux étapes, à des moments différents :

1. **Renommer le scope** (`@nx-react-nestjs` → `@<votre-scope>`) : tout de suite, avant d'écrire du code.
2. **Retirer les exemples** (`catalog`, `orders`, `notifications`, la boutique) : une fois votre premier domaine écrit, puisqu'ils servent de modèles, mais **avant le premier déploiement**, tant que les migrations peuvent être régénérées.

Les exemples de code ci-dessous utilisent le scope `@acme`. Ces étapes ont été déroulées de bout en bout sur une copie du repo : après chacune, `pnpm check`, le build, `web:i18n-check` et les parcours Playwright passent.

## En une commande : `pnpm create:project`

Juste après le clone, sur un arbre git propre :

```sh
pnpm install
pnpm create:project
git diff && pnpm check
```

La commande demande le nom du projet (vide : on garde `nx-react-nestjs`), puis, pour chaque option encore présente, si on la garde :

| Option          | Ce qu'un « non » retire                                                                                                                                                                                                                                                                                    |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `examples`      | le code d'exemple, comme `pnpm strip:examples` (étape 2 ci-dessous) ; à garder tant qu'il sert de modèle                                                                                                                                                                                                   |
| `sentry`        | Sentry de l'API et du service d'auth : `reportError`, son initialisation, ses tests, ses variables et les paquets `@sentry/*`                                                                                                                                                                              |
| `feature-flags` | les feature flags : catalogue, `@RequireFeature`, `requireFeature` et `useFeatureFlag` du front, `FEATURE_FLAGS`, leurs tests, et la règle « toute fonctionnalité derrière un flag » (principe 6, constitution, gabarits Spec Kit). Seulement avec les exemples ou après eux : le code d'exemple s'en sert |

Elle affiche un récapitulatif et ne modifie rien avant la confirmation (Ctrl-C, ou « non », laisse l'arbre intact). Puis elle renomme, retire, met à jour le lockfile, régénère ce qui doit l'être (migrations, routes, catalogues), reformate, et liste les mentions restantes à relire.

Sans question (CI, script) : `--yes` garde toute option non précisée, `--no-<option>` la retire, `--name <nom>` renomme ; `--keep-migrations` comme pour `strip:examples`. Exemple : `pnpm create:project --yes --name acme --no-sentry`. Sans terminal, `--yes` est obligatoire.

On peut la relancer plus tard : elle ne repose que les questions encore utiles (pas le nom une fois renommé, pas une option déjà retirée), et répond « Rien à faire. » s'il n'en reste aucune. Les deux sections suivantes détaillent ce que font le renommage et le retrait des exemples, aussi disponibles seuls.

## 1. Renommer le scope

Juste après le clone, sur un arbre git propre :

```sh
pnpm install
pnpm init:project acme
git diff && pnpm check
```

`init:project` remplace le scope `@nx-react-nestjs` par `@acme` (alias de `tsconfig.base.json`, imports, nom du `package.json` racine, messages de lint, doc) et renomme le projet et les images de `docker-compose.prod.yml` (`acme-api`…), puis reformate (des imports plus courts changent le découpage des lignes) et vide le cache de Nx. Il refuse un arbre modifié, pour que `git diff` montre exactement le renommage, et un second passage.

Rien d'autre à changer : ni le lockfile, ni les noms de projets Nx (`api`, `web`, `api-core`… n'ont pas de scope), ni le Dockerfile, la CI, les configs Vite, Vitest et Lingui ou les catalogues `.po`.

À adapter à la main selon le produit : `MAIL_FROM` dans `.env.example`, les comptes et l'organisation de démo (`tools/dev`), l'utilisateur et la base Postgres `app`, le titre du README, les propriétaires de `.github/CODEOWNERS` (`@AlMoustapha01` → votre équipe), l'index du produit si le produit a un cahier des charges (`specs/product.yml` : exigences, epics, parcours, rédigé avec `/speckit-prd` puis `/speckit-epics` ; voir [Spec Kit](spec-kit.md#index-du-produit)), et `author` et `repository` dans `tools/spec-kit/preset/preset.yml` (puis `specify preset update`, voir [Spec Kit](spec-kit.md#personnaliser-les-templates-ou-les-règles-tdd)).

## 2. Retirer les exemples

Une fois votre premier domaine écrit, et avant le premier déploiement, sur un arbre git propre :

```sh
pnpm strip:examples
git diff && pnpm check
```

Le script :

- supprime les fichiers propres aux exemples (`paths` de l'option `examples` dans `tools/dev/project-options-core.mts` : domaines, contrats, tests, lib et routes de la boutique) et, dans les fichiers partagés, les lignes entre `example:start` et `example:end` (modules de l'API, exports des contrats, flags d'exemple, produits du seed, navigation du front, doc). Un marqueur mal formé arrête tout avant le moindre changement. Il retire aussi de `tsconfig.base.json` les alias devenus sans cible ;
- repart d'une migration unique, `0000_init.sql` (tables de core et de vos domaines), régénère `routeTree.gen.ts` (build du front) et les catalogues Lingui, reformate et vide le cache de Nx ;
- liste les mentions des exemples qui restent : des règles générales illustrées par eux (`orders` → `ProductCatalog` → `CatalogFacade`, préfixes `PRD-`/`ORD-` dans `AGENTS.md`), des données de test. À relire et à remplacer par vos propres domaines.

Il refuse un second passage. Ensuite : retirer `FEATURE_FLAGS=storefront=true` de votre `apps/api/.env` (un flag inconnu empêche l'API de démarrer), puis `pnpm dev:down -v && pnpm dev:setup` pour une base locale neuve.

**Projet déjà déployé** : `pnpm strip:examples --keep-migrations`. Ne jamais supprimer ni réécrire une migration appliquée : retirer le code, déployer, puis générer une migration qui supprime les tables (`pnpm nx run api:db-generate --name=drop-examples`). drizzle-kit ne génère pas le `DROP SCHEMA` d'un `pgSchema` disparu : relire le SQL produit.

**Nouvelle option** : une entrée dans `PROJECT_OPTIONS` (`tools/dev/project-options-core.mts`) : la question, les fichiers propres à l'option (`paths`), ses paquets, ce qu'il faut régénérer et le motif des mentions à relire. Dans les fichiers partagés, son code va entre des marqueurs `option:<id>` sur des lignes entières : `// option:<id>:start` et `// option:<id>:end` (`{/* … */}` en JSX), `# option:<id>:start` (`.env.example`, YAML), `<!-- option:<id>:start -->` (Markdown, jamais au milieu d'un tableau). Les exemples gardent leurs marqueurs `example`. Un bloc ne contient jamais le marqueur d'une autre option : le script refuse avant toute modification. Ajouter enfin sa variante (`--no-<id>`) à la matrice du job `create-project` de la CI, qui lance la commande puis `pnpm check`.
