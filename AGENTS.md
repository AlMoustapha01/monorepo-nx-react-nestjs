# AGENTS.md

Monorepo Nx : API NestJS (`apps/api`) + front React (`apps/web`). Ce fichier est la référence pour les humains comme pour les agents de code.

## Commandes

| Besoin                                                               | Commande                                                                                       |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Première installation : `.env`, Postgres, Redis, Mailpit, migrations | `pnpm install && pnpm dev:setup`                                                               |
| Lancer l'API                                                         | `pnpm nx serve api` → http://localhost:3000/api/v1, Swagger sur `/api/docs`                    |
| Données de démo (API démarrée)                                       | `pnpm dev:seed`                                                                                |
| Token pour appeler l'API (Swagger, curl)                             | `pnpm -s dev:token` (client) ou `--staff` ; aussi `--new-tenant`, `--no-email`, `--expires 1h` |
| Voir les emails envoyés en local                                     | http://localhost:8025 (Mailpit)                                                                |
| Appliquer les migrations                                             | `pnpm nx run api:db-migrate`                                                                   |
| Générer une migration après un changement de schéma                  | `pnpm nx run api:db-generate --name=<sujet>`                                                   |
| Tout vérifier, comme la CI (format, lint, types, tests, code mort)   | `pnpm check`                                                                                   |
| Seulement ce qui a changé                                            | `pnpm nx affected -t lint typecheck test`                                                      |
| Formater                                                             | `pnpm format`                                                                                  |

Port déjà pris sur votre machine (un autre Postgres, un autre Redis…) : changez `POSTGRES_PORT`, `REDIS_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` ou `PORT` dans `.env`, et le port de l'URL correspondante (`DATABASE_URL`, `REDIS_URL`, `SMTP_URL`). `pnpm dev:setup` refuse des valeurs incohérentes et nomme la variable en conflit.

Les tests d'intégration (`*.int.spec.ts`) et e2e (`apps/api/tests`) démarrent Postgres, Redis (et Mailpit pour l'email) via Testcontainers : Docker doit tourner.

La CI (`.github/workflows/ci.yml`) tourne sur chaque PR et sur `main` : format, puis lint, types, tests et build des seuls projets affectés (`nx affected`), typage des scripts de `tools/dev`, puis knip. Les actions sont épinglées par SHA. Les scripts de `tools/dev` sont du TypeScript exécuté directement par Node 24, sans build.

## Structure

```
apps/api/                   bootstrap uniquement : main.ts, AppModule, migrations/
libs/api/core/              transverse : config, erreurs, auth, contexte tenant, DB, outbox + BullMQ, logs, health
libs/api/<domaine>/         un domaine métier = une lib Nx
  src/index.ts              FAÇADE : seul point d'entrée public
  src/lib/domain/           entités et règles, TypeScript pur
  src/lib/application/      cas d'usage, ports (repositories), façade
  src/lib/infra/            adapters : Drizzle (*.schema.ts), clients externes
  src/lib/http/             controllers fins + DTO zod
libs/shared/contracts/      schémas zod partagés entre front et API
apps/web/                   front React : routes TanStack Router (src/routes), i18n Lingui (voir apps/web/AGENTS.md)
libs/web/ui/                design system : thème Tailwind 4, composants shadcn, Storybook
libs/web/data-access/       client API, TanStack Query, mutations idempotentes
```

Conventions du front : [`apps/web/AGENTS.md`](apps/web/AGENTS.md) et [`libs/web/AGENTS.md`](libs/web/AGENTS.md).

Domaines d'exemple à copier : `libs/api/catalog` (agrégat simple, compteur de ventes alimenté par événements), `libs/api/orders` (agrégat sur deux tables, dépendance au catalogue par sa façade, publication d'événements) et `libs/api/notifications` (domaine purement réactif : aucun controller, seulement des handlers).

## Règles de frontières

- Tags Nx : `scope:api|web|shared` × `type:app|domain|core|contract|feature|ui|data-access`. `core` ne dépend jamais d'un domaine (lint).
- Un domaine n'importe d'un autre domaine que sa façade (`@nx-react-nestjs/api-<domaine>`). Les imports profonds ne compilent pas (alias TypeScript limités à `index.ts`).
- Consommer un autre domaine : un port dans `application/` (ce dont on a besoin, rien de plus) et un adapter dans `infra/` qui délègue à sa façade. Exemple : `orders` → `ProductCatalog` → `CatalogFacade`.
- `index.ts` d'un domaine : exports nommés uniquement, jamais `export *`. N'y exposer que le module Nest, la façade et des types de contrat (snapshots), jamais une entité ni un repository (vérifié en revue).
- `domain/` n'importe ni NestJS, ni Drizzle, ni `pg` (lint, `no-restricted-imports` du `.oxlintrc.json` de chaque domaine).
- Chaque domaine possède son schéma Postgres (`pgSchema('<domaine>')`). Pas de jointure ni de clé étrangère vers les tables d'un autre domaine : passer par sa façade ou ne garder qu'un ID.

## Autorisations

- Tout utilisateur authentifié est un **client**. Un rôle ajoute des droits ; il vient de la claim `roles` du JWT (`staff` aujourd'hui, liste `ROLES` dans api-core). Un rôle inconnu est ignoré.
- **Rôle requis par une route** : `@RequireRole('staff')` sur la méthode ou le controller ; le `RolesGuard` global renvoie 403 `FORBIDDEN`.
- **Accès à une ressource** (propriété, visibilité) : c'est une règle métier, appliquée dans le cas d'usage avec `RequestContext` (`userId`, `hasRole`), jamais dans le controller. Une ressource qu'on n'a pas le droit de voir répond **404**, comme si elle n'existait pas : on ne révèle pas son existence.
- Règles actuelles : un client ne voit que les produits publiés et que ses commandes ; le staff gère le catalogue et voit toutes les commandes du tenant.
- Un handler d'événement s'exécute au nom de l'auteur de l'événement, sans rôle : il passe par les repositories, pas par les cas d'usage soumis à autorisation.

## Événements d'intégration (outbox + BullMQ)

Les façades servent aux lectures et commandes synchrones entre domaines ; les événements servent aux réactions asynchrones. Un domaine qui réagit ne dépend que du contrat de l'événement, jamais du domaine émetteur (le catalogue écoute les commandes alors que les commandes dépendent du catalogue).

- **Déclarer** : `defineIntegrationEvent('<domaine>.<fait-au-passé>.v1', schemaZod)` dans `libs/shared/contracts/src/lib/<domaine>/*.events.ts`. Une version publiée ne change plus : on crée `v2`. Le payload porte tout ce dont les consommateurs ont besoin.
- **Publier** : dans le cas d'usage, `transactions.transaction(async () => { await repo.insert(x); await outbox.publish(Event, payload); })`. L'outbox refuse de publier hors transaction : l'événement et l'écriture métier sont atomiques.
- **Consommer** : un provider `@OnIntegrationEvent(Event, { name: '<domaine>.<action>' })` qui implémente `IntegrationEventHandler`, déclaré dans le module du domaine. Le `name` est stable (clé d'idempotence et ID de job).
- **Garanties** : livraison au moins une fois. Le worker exécute le handler dans une transaction avec sa marque d'idempotence : un effet en base n'a lieu qu'une fois. Un handler qui appelle surtout un service externe (email, API) déclare `transactional: false` : il s'exécute hors transaction, pour ne pas garder une connexion Postgres pendant l'appel, et la marque est posée après succès. Un crash entre les deux fait rejouer l'appel : utiliser `event.id` comme clé d'idempotence chez le fournisseur.
- **Contexte** : le handler s'exécute au nom du tenant et de l'auteur de l'événement (`RequestContext`) ; les repositories restent filtrés par tenant sans rien changer.
- **Exploitation** : 10 tentatives avec backoff exponentiel ; un payload invalide échoue sans retry. Rétention : outbox 7 jours, marques d'idempotence 30 jours, jobs Redis 24 h (succès) et 7 jours (échecs). `JOBS_ENABLED=false` donne un process API sans relais ni worker.
- **Tests** : `RecordingOutbox` et `InlineTransactionManager` (`api-core/testing`) pour les cas d'usage ; `eventually()` pour attendre un traitement asynchrone en e2e.

## Principes non négociables

1. Toute table métier a une colonne `tenant_id`, et aucun repository ne lit ni n'écrit sans ce filtre. Le tenant vient de `RequestContext`, jamais d'un paramètre de requête.
2. Toute erreur métier est une sous-classe d'`AppError` avec un code stable en union littérale. `throw new Error()` est interdit hors `infra/` et du démarrage. La conversion en HTTP (RFC 9457) se fait uniquement dans `ProblemDetailsFilter`.
3. Toute route est authentifiée par défaut ; `@Public()` est l'unique exception explicite. Toute route qui modifie des données partagées du tenant déclare son rôle (`@RequireRole`).
4. Toute clé Redis a un TTL ; tout appel externe a un timeout, et passe par une queue s'il est lent.
5. Les migrations sont générées (`db-generate`), jamais éditées à la main, et rétrocompatibles (expand/contract).
6. Toute nouvelle fonctionnalité passe derrière un feature flag (désactivé par défaut) ; une PR fait moins de 500 lignes. Le flag s'applique à l'API pour l'instant ; le mécanisme front sera défini avec le premier écran métier (voir `apps/web/AGENTS.md`).

## Conventions

- Validation : schéma zod dans `libs/shared/contracts`, DTO via `createZodDto` dans `http/`, réponse via `@ZodSerializerDto`.
- Persistance : un mapper par agrégat dans `infra/` (`<Agrégat>Mapper extends PersistenceMapper<Agrégat, Row>`), qui reconstruit via `restore`. Le repository ne fait aucune conversion lui-même.
- Identifiants métier : `<PRÉFIXE>-<suffixe>` (`PRD-…`, `ORD-…`), générés par `domainIdGenerator` (api-core) et validés par `domainIdSchema` (contracts). Le suffixe commence par l'horodatage, donc les IDs se trient par création. Préfixe déclaré une fois dans les contrats du domaine (`ORDER_ID_PREFIX`). En base : `text COLLATE "C"`. `tenantId` et les IDs d'utilisateur restent des UUID : ils viennent du fournisseur d'identité.
- Idempotence : toute route qui crée une ressource à effet métier (commande, paiement…) porte `@Idempotent({ required: true })`. Le client envoie `Idempotency-Key` (UUID) et peut réessayer : même clé et même requête → réponse rejouée (`Idempotent-Replayed: true`), même clé et requête différente → 422. La clé est écrite dans la même transaction que l'effet ; une erreur ne la consomme pas.
- Verrou optimiste : tout agrégat modifiable a une colonne `version`. Le repository n'écrit que si la version n'a pas bougé (sinon `<AGRÉGAT>_VERSION_CONFLICT`, 409) puis appelle `markPersisted()`. Si des clients éditent la ressource, exposer `version` et `ETag` (`etagFor`), lire `If-Match` (`@IfMatchVersion()`) et appeler `assertExpectedVersion` dans le cas d'usage (412). Une projection (ex. `soldCount`) n'avance pas la version.
- Feature flags : déclarés dans `FEATURE_FLAGS` (contracts) avec une description, une valeur par défaut et `client` (exposé au front par `GET /api/v1/feature-flags`). Une route derrière un flag porte `@RequireFeature('<flag>')` (404 `FEATURE_DISABLED` quand il est coupé) ; ailleurs, injecter `FeatureFlags` et appeler `isEnabled`. Valeurs surchargées par `FEATURE_FLAGS=orders.cancellation=false,...` (un nom inconnu bloque le démarrage). Tests : `StaticFeatureFlags` (`api-core/testing`), en e2e via `overrideProvider(FeatureFlags)`. Une fois la fonctionnalité déployée partout, supprimer le flag.
- Argent : entier en unités mineures (`amountMinor`) + devise ISO. Jamais de flottant.
- Pagination : par curseur (`limit`, `cursor` → `items`, `nextCursor`), triée par `(created_at, id)` décroissants.
- API versionnée par URI : `/api/v1/...`. `/health` et `/ready` restent hors préfixe.
- Tests : unitaires sur `domain/` et `application/` (fake en mémoire, pas de mock d'ORM), intégration sur un vrai Postgres, e2e via `configureApp` + supertest.

## Pièges connus

- `@nestjs/swagger` reste en v11 tant que NestJS est en v11 (la v12 exige NestJS 12).
- Node 24 LTS est requis (`.nvmrc`, `engines`) : `nvm use` à l'entrée du repo. pnpm est épinglé via `packageManager` (corepack).
- `jose` v6 est en ESM uniquement, chargé par `require` (natif et sans avertissement depuis Node 24).
- BullMQ v6 : `ioredis` est une dépendance optionnelle chargée à la demande, et un ID de job ne peut pas contenir `:`.
- nodemailer : le second argument de `createTransport` contient les valeurs par défaut des messages, pas les options de transport (timeouts, URL).
- Une classe de base abstraite injectée par héritage doit porter `@Injectable()`, sinon Nest ne voit pas les dépendances de son constructeur.
