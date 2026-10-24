# AGENTS.md

Monorepo Nx : API NestJS (`apps/api`) + front React (`apps/web`). Ce fichier est la référence pour les humains comme pour les agents de code : les règles et conventions. Les procédures ponctuelles (auth en local, dépendances, maintenance de Spec Kit) sont dans [`docs/`](docs/README.md).

## Commandes

| Besoin                                                                | Commande                                                                                                             |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Première installation : `.env`, Postgres, Redis, Mailpit, migrations  | `pnpm install && pnpm dev:setup`                                                                                     |
| Lancer l'API                                                          | `pnpm nx serve api` → http://localhost:3000/api/v1, Swagger sur `/api/docs`                                          |
| Nouveau projet : renommer le scope `@nx-react-nestjs`                 | `pnpm init:project <nom>` (une fois, arbre propre) ; voir [Démarrer un projet](docs/guides/demarrer-un-projet.md)    |
| Retirer le code d'exemple, avant le premier déploiement               | `pnpm strip:examples` (arbre propre ; `--keep-migrations` si déjà déployé) ; voir le même guide                      |
| Nouveau domaine métier : lib API vide, alias et module câblés         | `pnpm new:domain <nom>` (ex. `billing`), puis le code en TDD                                                         |
| Nouvelle lib feature front : lib vide, config de test et alias câblés | `pnpm new:web-feature <nom>`, puis les écrans en TDD ; voir [`libs/web/AGENTS.md`](libs/web/AGENTS.md)               |
| Données de démo (API démarrée)                                        | `pnpm dev:seed`                                                                                                      |
| Token pour appeler l'API (Swagger, curl)                              | `pnpm -s dev:token` (client) ou `--staff` ; aussi `--new-tenant`, `--no-email`, `--expires 1h`                       |
| Lancer le service d'identité (Better Auth)                            | `pnpm nx serve auth` → http://localhost:3100/api/auth                                                                |
| Voir les emails envoyés en local                                      | http://localhost:8025 (Mailpit)                                                                                      |
| Appliquer les migrations                                              | `pnpm nx run api:db-migrate`                                                                                         |
| Générer une migration après un changement de schéma                   | `pnpm nx run api:db-generate --name=<sujet>`                                                                         |
| Tout vérifier, comme la CI (format, lint, types, tests, code mort)    | `pnpm check`                                                                                                         |
| Parcours navigateur (Playwright) contre la vraie stack, Docker requis | `pnpm nx run web-e2e:e2e` (`pnpm exec playwright install chromium` la première fois)                                 |
| Seulement ce qui a changé                                             | `pnpm nx affected -t lint typecheck test`                                                                            |
| Formater                                                              | `pnpm format`                                                                                                        |
| Traces en local (Grafana sur http://localhost:3001)                   | `docker compose --profile observability up -d`, puis `OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318` dans `.env` |
| Vérifier la topologie de prod en local (images, migrations, services) | `BETTER_AUTH_SECRET=$(openssl rand -hex 32) docker compose -f docker-compose.prod.yml up --build`                    |
| Développer une fonctionnalité (Spec Kit, dans Claude Code)            | `/speckit-specify <description>`, puis la suite du cycle (voir [plus bas](#développer-une-fonctionnalité-spec-kit))  |
| Matrice scénario → tests, et état des exigences du cahier des charges | `pnpm -s spec:trace` (toutes) ou `… specs/<NNN-nom>` (stricte) ; voir « Specs à jour » plus bas                      |
| Régénérer la référence des codes d'erreur après en avoir ajouté un    | `pnpm docs:errors` ; voir [Codes d'erreur](docs/reference/codes-erreur.md)                                           |

Port déjà pris sur votre machine (un autre Postgres, un autre Redis…) : changez `POSTGRES_PORT`, `REDIS_PORT`, `MAILPIT_SMTP_PORT`, `MAILPIT_UI_PORT` ou `PORT` dans `.env`, et le port de l'URL correspondante (`DATABASE_URL`, `REDIS_URL`, `SMTP_URL`). `pnpm dev:setup` refuse des valeurs incohérentes et nomme la variable en conflit.

`nx affected` compare à la branche `main` locale : si elle est en retard sur le dépôt (copie de travail jamais mise à jour), il relance des projets déjà mergés. `git fetch`, puis `--base=origin/main`.

Les tests d'intégration (`*.int.spec.ts`) et e2e (`apps/api/tests`) démarrent Postgres, Redis (et Mailpit pour l'email) via Testcontainers : Docker doit tourner.

La CI (`.github/workflows/ci.yml`) tourne sur chaque PR et sur `main` : format, puis lint, types, tests et build des seuls projets affectés (`nx affected`), typage et tests des scripts de `tools/dev`, matrice des specs (`spec:trace`), puis knip. Un job à part lance les parcours navigateur (`web-e2e`) quand le front, l'API ou le service d'auth ont changé ; en échec, il publie rapport, traces et journaux. Les actions sont épinglées par SHA. Les scripts de `tools/dev` sont du TypeScript exécuté directement par Node 24, sans build. Lire un échec, reproduire un job en local : [Intégration continue](docs/guides/ci.md).

Dépendances : audit bloquant en CI (`pnpm audit --prod` en local), Renovate ; corriger une faille par mise à jour, override ciblée ou exception justifiée : voir [Dépendances et failles](docs/guides/dependances.md).

## Structure

```
apps/api/                   bootstrap uniquement : main.ts (HTTP), worker.ts, migrate.ts, AppModule, migrations/
apps/auth/                  service d'identité (Better Auth) : comptes, organisations (tenants), access tokens, JWKS
libs/api/core/              transverse : config, erreurs, auth, contexte tenant, DB, outbox + BullMQ, email, logs, health
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
specs/NNN-<nom>/            une fonctionnalité Spec Kit : spec.md, plan.md, tasks.md (en anglais)
.specify/                   Spec Kit : constitution (memory/), scripts, templates ; généré, sauf la constitution
tools/spec-kit/preset/      source des personnalisations de Spec Kit (templates, règles TDD)
tools/dev/spec-trace.mts    matrice scénario → tests (`pnpm -s spec:trace`)
docs/agents/                consignes portables des agents relecteurs (relecteur indépendant)
.claude/                    adaptateur Claude Code : sous-agent `relecteur`, hook de fin de tour, skills Spec Kit
```

Conventions du front : [`apps/web/AGENTS.md`](apps/web/AGENTS.md) et [`libs/web/AGENTS.md`](libs/web/AGENTS.md).

Un nouveau domaine se crée avec `pnpm new:domain <nom>` : la lib (config Nx, TypeScript, Vitest, oxlint avec la règle de `domain/`), sa façade et son module enregistré dans l'AppModule, sans code métier. La forme de chaque fichier d'un domaine (agrégat, port, fake, repository, controller, tests) est montrée sur un exemple fictif dans [Référence : un domaine de l'API](docs/reference/domaine-api.md), celle d'un écran dans [Référence : une lib feature du front](docs/reference/feature-web.md) ; la carte d'ensemble dans [Architecture](docs/architecture/vue-d-ensemble.md).

<!-- example:start -->

Domaines d'exemple dont s'inspirer : `libs/api/catalog` (agrégat simple, compteur de ventes alimenté par événements), `libs/api/orders` (agrégat sur deux tables, dépendance au catalogue par sa façade, publication d'événements) et `libs/api/notifications` (domaine purement réactif : aucun controller, seulement des handlers). Le code propre aux exemples est dans ses propres fichiers ou entre des lignes `example:start` et `example:end` : `pnpm strip:examples` les retire, et la CI vérifie qu'un projet sans exemples passe `pnpm check`. Un nouvel exemple suit la même règle.

<!-- example:end -->

## Règles de frontières

- Tags Nx : `scope:api|web|shared` × `type:app|domain|core|contract|feature|ui|data-access`. `core` ne dépend jamais d'un domaine (lint).
- Un domaine n'importe d'un autre domaine que sa façade (`@nx-react-nestjs/api-<domaine>`). Les imports profonds ne compilent pas (alias TypeScript limités à `index.ts`).
- Consommer un autre domaine : un port dans `application/` (ce dont on a besoin, rien de plus) et un adapter dans `infra/` qui délègue à sa façade. Exemple : `orders` → `ProductCatalog` → `CatalogFacade`.
- `index.ts` d'un domaine : exports nommés uniquement, jamais `export *`. N'y exposer que le module Nest, la façade et des types de contrat (snapshots), jamais une entité ni un repository (vérifié en revue).
- `domain/` n'importe ni NestJS, ni Drizzle, ni `pg` (lint, `no-restricted-imports` du `.oxlintrc.json` de chaque domaine).
- Chaque domaine possède son schéma Postgres (`pgSchema('<domaine>')`). Pas de jointure ni de clé étrangère vers les tables d'un autre domaine : passer par sa façade ou ne garder qu'un ID.

## Authentification

- **Contrat** : l'API accepte un access token JWT signé par le fournisseur d'identité, vérifié avec ses clés publiques (`AUTH_JWKS_URL`, algorithmes EdDSA, ES256 ou RS256) ; `iss` et `aud` obligatoires. `sub` (utilisateur) et le tenant sont des UUID ; tenant et rôles sont lus dans `AUTH_TENANT_CLAIM` et `AUTH_ROLES_CLAIM` (`tenant_id`, `roles` par défaut ; chemin pointé accepté). Changer de fournisseur ne demande que de la configuration, s'il fournit des UUID.
- **Fournisseur** : `apps/auth`, Better Auth dans un service à part, tables dans le schéma Postgres `auth`. Email et mot de passe avec vérification de l'email ; une **organisation** Better Auth est un tenant ; `owner` et `admin` donnent le rôle `staff`, `member` aucun (`apps/auth/src/claims.ts`). Le front obtient un token de 15 min par `GET /api/auth/token` (cookie de session) et l'envoie en `Authorization: Bearer`.
- **Contenu du token** : `tenant_id` = organisation active de la session, et seulement si l'utilisateur en est encore membre ; à la connexion, la première organisation de l'utilisateur devient active. `email` seulement s'il est vérifié. Rien d'autre.
- **Dev et tests** : `AUTH_JWT_SECRET` (HS256) remplace le JWKS, pour `dev:token`, `signTestToken` et les e2e ; refusé en production. L'un ou l'autre, jamais les deux. Vrai service et comptes de démo en local : [Authentification en local](docs/guides/auth-en-local.md).
- **Anti-brute-force** : Better Auth limite les tentatives par IP (3 connexions par 10 s). Le serveur lui passe l'IP du socket, ou celle de `X-Forwarded-For` derrière `TRUST_PROXY_HOPS` proxys : sans ça, tous les clients partageraient un compteur, et un attaquant bloquerait la connexion de tout le monde.
- **Fournisseur injoignable** : les clés déjà téléchargées restent en cache ; seul un token signé par une clé inconnue échoue (401, journalisé en `warn`).

## Autorisations

- Tout utilisateur authentifié est un **client**. Un rôle ajoute des droits ; il vient de la claim `roles` du JWT (`staff` aujourd'hui, liste `ROLES` dans api-core). Un rôle inconnu est ignoré.
- **Rôle requis par une route** : `@RequireRole('staff')` sur la méthode ou le controller ; le `RolesGuard` global renvoie 403 `FORBIDDEN`.
- **Accès à une ressource** (propriété, visibilité) : c'est une règle métier, appliquée dans le cas d'usage avec `RequestContext` (`userId`, `hasRole`), jamais dans le controller. Une ressource qu'on n'a pas le droit de voir répond **404**, comme si elle n'existait pas : on ne révèle pas son existence.
- Un handler d'événement s'exécute au nom de l'auteur de l'événement, sans rôle : il passe par les repositories, pas par les cas d'usage soumis à autorisation.

<!-- example:start -->

- Règles actuelles : un client ne voit que les produits publiés et que ses commandes ; le staff gère le catalogue et voit toutes les commandes du tenant.

<!-- example:end -->

## Événements d'intégration (outbox + BullMQ)

Les façades servent aux lectures et commandes synchrones entre domaines ; les événements servent aux réactions asynchrones. Un domaine qui réagit ne dépend que du contrat de l'événement, jamais du domaine émetteur (le catalogue écoute les commandes alors que les commandes dépendent du catalogue).

- **Déclarer** : `defineIntegrationEvent('<domaine>.<fait-au-passé>.v1', schemaZod)` dans `libs/shared/contracts/src/lib/<domaine>/*.events.ts`. Une version publiée ne change plus : on crée `v2`. Le payload porte tout ce dont les consommateurs ont besoin.
- **Publier** : dans le cas d'usage, `transactions.transaction(async () => { await repo.insert(x); await outbox.publish(Event, payload); })`. L'outbox refuse de publier hors transaction : l'événement et l'écriture métier sont atomiques.
- **Consommer** : un provider `@OnIntegrationEvent(Event, { name: '<domaine>.<action>' })` qui implémente `IntegrationEventHandler`, déclaré dans le module du domaine. Le `name` est stable (clé d'idempotence et ID de job).
- **Garanties** : livraison au moins une fois. Le worker exécute le handler dans une transaction avec sa marque d'idempotence : un effet en base n'a lieu qu'une fois. Un handler qui appelle surtout un service externe (email, API) déclare `transactional: false` : il s'exécute hors transaction, pour ne pas garder une connexion Postgres pendant l'appel, et la marque est posée après succès. Un crash entre les deux fait rejouer l'appel : utiliser `event.id` comme clé d'idempotence chez le fournisseur.
- **Contexte** : le handler s'exécute au nom du tenant et de l'auteur de l'événement (`RequestContext`) ; les repositories restent filtrés par tenant sans rien changer.
- **Exploitation** : 10 tentatives avec backoff exponentiel ; un payload invalide échoue sans retry. Rétention : outbox 7 jours, marques d'idempotence 30 jours, jobs Redis 24 h (succès) et 7 jours (échecs). `JOBS_ENABLED=false` donne un process API sans relais ni worker.
- **Tests** : `RecordingOutbox` et `InlineTransactionManager` (`api-core/testing`) pour les cas d'usage ; `eventually()` pour attendre un traitement asynchrone en e2e.
- **Email** : injecter `Mailer` (api-core, fourni par `CoreModule`) dans un handler `transactional: false`, jamais dans la requête. SMTP si `SMTP_URL` est défini (Mailpit en local, obligatoire en production ; timeouts de 10 s), sinon l'email est seulement journalisé. Passer `event.id` en `idempotencyKey` : il devient le `Message-ID`, identique d'un retry à l'autre. Tests : `RecordingMailer` (`api-core/testing`) ; en e2e, un conteneur Mailpit (Testcontainers) dont on lit les messages par son API HTTP (`/api/v1/messages`).

## Déploiement

Procédure complète (ordre, configuration, expand/contract, liste avant la première mise en production) : [Déployer](docs/guides/deployer.md).

- **Une image** (`Dockerfile`), trois commandes : `node main.js` (HTTP), `node worker.js` (relais de l'outbox, worker BullMQ, purge quotidienne), `node migrate.js`. `docker-compose.prod.yml` montre l'enchaînement.
- **Service d'identité** : même Dockerfile avec `--build-arg APP=auth`, deux commandes : `node main.js` et `node migrate.js` (tables de Better Auth : ajouts seulement, rétrocompatibles). `BETTER_AUTH_SECRET` chiffre les clés privées du JWKS en base : le changer rend ces clés illisibles.
- **Migrations** : étape de déploiement à part, avant le démarrage des nouvelles instances, jamais au boot de l'API. `migrate.js` prend un verrou Postgres : deux déploiements simultanés se sérialisent. Comme les anciennes instances tournent encore pendant la migration, elle doit rester rétrocompatible (principe 5).
- **Rôles** : l'API tourne avec `JOBS_ENABLED=false` ; le worker force les jobs. Chacun se met à l'échelle séparément. En dev, `nx serve api` fait tout dans un seul process.
- **Sondes** : `/health` (liveness : le process répond) et `/ready` (readiness : Postgres et Redis joignables, et pas d'arrêt en cours). Le worker n'a pas de port HTTP : un crash fait sortir le process et l'orchestrateur le relance.
- **Arrêt** : sur SIGTERM, `/ready` passe en 503, le process attend `SHUTDOWN_DRAIN_MS` (le temps que le load balancer retire l'instance ; 5 s derrière Kubernetes), puis termine les requêtes et les jobs en cours et ferme Redis et Postgres. Au-delà de `SHUTDOWN_TIMEOUT_MS` (25 s), il sort en erreur : rester sous le délai avant SIGKILL de l'orchestrateur (30 s par défaut).
- **Redis** en production : `maxmemory-policy noeviction` et persistance (AOF), sinon BullMQ peut perdre des jobs.
- **Rate limiting** : `RATE_LIMIT_MAX` requêtes par `RATE_LIMIT_TTL_MS`, compteurs dans Redis partagés par toutes les instances. Un utilisateur authentifié a son compteur ; sans token, c'est par IP : derrière un load balancer, `TRUST_PROXY_HOPS=1`, sinon tous les anonymes partagent l'IP du proxy. Au-delà : 429 `TOO_MANY_REQUESTS` avec `Retry-After`. Redis en panne : on laisse passer (avertissement journalisé, une fois par minute). Une requête au token invalide est refusée avant d'être comptée : les floods anonymes se filtrent en amont (load balancer, WAF). `@SkipThrottle()` pour exclure une route (sondes).

## Observabilité

En pratique : [Observabilité en local](docs/guides/observabilite-en-local.md) (Grafana, traces, logs, span sur mesure) et [Référence : métriques et alertes](docs/reference/metriques-et-alertes.md).

- **Traces** : OpenTelemetry, activé par `OTEL_EXPORTER_OTLP_ENDPOINT` (OTLP/HTTP) et configuré par les variables standard (`OTEL_SERVICE_NAME`, `OTEL_TRACES_SAMPLER`…). `apps/api/src/instrumentation.ts` est le premier import de `main.ts` et `worker.ts` : HTTP, Express, Nest et Postgres sont instrumentés. `/health` et `/ready` ne sont pas tracés ; une requête SQL hors span (sondage du relais) non plus.
- **Événements** : l'outbox stocke le contexte W3C de la requête (`trace_context`) ; le worker exécute chaque handler dans un span `process <handler>` enfant de cette requête. Une seule trace va de la requête HTTP jusqu'aux handlers, dans le service `api-worker`.
- **Métriques** (OTLP, toutes les 60 s ; `OTEL_METRIC_EXPORT_INTERVAL`) : durée des requêtes HTTP par route, et pour la messagerie `outbox.pending_events`, `outbox.oldest_pending_age` (retard du relais), `integration_events.handler.duration` (par handler et issue), `integration_events.queue.jobs` (par état) et `integration_events.jobs.exhausted` (jobs abandonnés). Alertes conseillées : retard de l'outbox au-delà d'une minute, tout job abandonné. Les jauges sont lues par le process qui a `JOBS_ENABLED=true`.
- **Logs** : chaque ligne émise pendant un span porte `trace_id` et `span_id` (instrumentation pino).
- **Erreurs** : Sentry, activé par `SENTRY_DSN`, pour les erreurs seulement (traces et métriques restent dans OpenTelemetry). Sont envoyées : les 5xx inattendues (filtre RFC 9457, avec route, `request_id`, tenant et ID utilisateur), les jobs abandonnés (pas les échecs suivis d'un retry réussi), les exceptions non rattrapées. Chaque erreur porte le `trace_id` : on passe de Sentry à la trace et aux logs. Ailleurs, `reportError(error, { tags })` (api-core). Pas d'email ni de donnée personnelle chez Sentry : l'ID utilisateur seulement.
- **Service d'identité** (`apps/auth`) : mêmes variables, service `auth` (`AUTH_OTEL_SERVICE_NAME` pour le changer, le `.env` de dev étant partagé avec l'API). HTTP, Postgres et les spans de Better Auth (endpoints, hooks) sont tracés ; vont à Sentry, avec le tag `service: auth`, ses erreurs inattendues (pas les refus 4xx) et les emails impossibles à envoyer.
- **Code métier** : rien à faire. Pour un span sur mesure, `trace.getTracer('<domaine>')` de `@opentelemetry/api`, sans dépendre du SDK.
- **Tests** : `startTestTelemetry()` (`api-core/testing`) enregistre un vrai SDK qui garde spans et métriques en mémoire.
- `@opentelemetry/api` reste en `~1.9` tant que le SDK est en 2.x (la 1.10 n'est acceptée que par le SDK 3).

## Développer une fonctionnalité (Spec Kit)

Toute fonctionnalité d'un projet issu du boilerplate part d'une spec, avec [Spec Kit](https://github.com/github/spec-kit) (1.2.2), installé et configuré dans le repo pour Claude Code.

<!-- example:start -->

Le code d'exemple (`catalog`, `orders`, `notifications`, boutique du front) n'a pas de spec.

<!-- example:end -->

- **Cycle**, dans Claude Code :
  1. `/speckit-specify <description>` : crée la branche `NNN-<nom>` (arbre propre, depuis `main`), puis le quoi et le pourquoi dans `specs/NNN-<nom>/spec.md`, sans technique ;
  2. `/speckit-clarify` : questions sur les `[NEEDS CLARIFICATION]`, jusqu'à ce qu'il n'en reste plus ;
  3. `/speckit-plan` : domaines, feature flag, événements, migrations, règles d'accès, stratégie de test (un test par scénario d'acceptation) ;
  4. `/speckit-tasks`, puis `/speckit-analyze` (cohérence spec, plan, tâches) ; `/speckit-checklist` en option ;
  5. `/speckit-implement`, puis `/speckit-converge`, à répéter jusqu'à « Converged ». Quand une story n'a plus de manque, `/speckit-converge` la fait relire par le relecteur indépendant avant de conclure.
- **Commits** : chaque commande qui écrit des fichiers commite son résultat sur la branche de la fonctionnalité, avec un message Conventional Commits en anglais (voir [le guide](docs/guides/spec-kit.md#branche-et-commits-automatiques)).
- **Specs, plans et tâches en anglais.** Une user story par PR.
- **TDD** : les tests sont obligatoires dans les tâches, écrits avant le code et vus en échec. `/speckit-implement` ne coche une tâche de test qu'après l'échec du test, et une tâche de code qu'après le passage de ses tests ; `pnpm nx affected -t lint typecheck test e2e` doit passer à la fin de chaque user story (les parcours navigateur ne tournent que si le front, l'API ou le service d'auth ont changé, comme en CI). `/speckit-converge` ne conclut pas tant qu'un scénario d'acceptation n'a pas de test.
- **Traçabilité spec → tests** : chaque scénario d'acceptation a un identifiant `<numéro de la feature>-US<story>-AS<n>` (`003-US1-AS2`), et le titre de chaque test qui le couvre commence par cet identifiant : `it('003-US1-AS2: refuses to cancel a shipped order', …)`. `pnpm -s spec:trace` en tire la matrice scénario → fichiers de test et échoue si un scénario n'a aucun test, ou si un test cite un scénario absent de la spec (spec modifiée, test mal nommé). `/speckit-converge` la lance avant de conclure. Les scénarios ne sont jamais renumérotés : un nouveau prend le numéro suivant, celui d'un scénario retiré reste libre. La matrice prouve qu'un test cite chaque scénario, pas qu'il le vérifie bien : la relecture des tests reste nécessaire.
- **Relecture indépendante** : celui qui produit ne valide pas. Le relecteur part d'un contexte vierge, sans le résumé de l'auteur, et applique la grille de [`docs/agents/relecteur.md`](docs/agents/relecteur.md) : scénarios, bugs, principes non négociables, rien sur le style. Sous-agent `relecteur` dans Claude Code, nouvelle session ailleurs ; on le lance aussi hors Spec Kit (« relis cette branche avec le relecteur »). Un écart bloquant devient une tâche ; un écart contesté l'est avec une preuve et reste ouvert (pas de « Converged ») jusqu'à ce que l'humain tranche.
- **Chemins sensibles** : listés dans [`.github/CODEOWNERS`](.github/CODEOWNERS) (identité, isolation des tenants, migrations, garanties transverses de l'API, CI et images, règles des agents). Une PR qui en touche un est relue par un humain, en plus du relecteur. Un nouveau chemin sensible (paiements, webhooks, données personnelles) s'y ajoute dans la PR qui le crée.
- **Vérification de fin de tour** (Claude Code) : un hook `Stop` (`.claude/settings.json`, `tools/dev/stop-check.mts`) vérifie format, lint et types des fichiers changés sur la branche ; en échec, l'agent reprend la main avec l'erreur. `STOP_CHECK=off` le coupe (arbre partagé avec une autre session). Les tests restent dans `/speckit-implement` et la CI.
- **Specs à jour** : une fois mergée, `spec.md` décrit le comportement actuel. Une PR qui change le comportement d'une fonctionnalité spécifiée modifie son `spec.md` dans la même PR. Un scénario ne se supprime pas, il se retire (`**Retired** (replaced by …)`), et aucun test ne doit plus le citer. Statut en tête de spec : `Draft` → `Implemented` (`/speckit-converge`) → `Shipped` (PR qui supprime le flag) → `Retired`. `spec:trace` échoue si un scénario d'une spec `Implemented` ou `Shipped` n'a pas de test. Détails : [Spec Kit : cycle de vie et maintenance](docs/guides/spec-kit.md).
- **Exigences du produit** : `specs/product-requirements.json` liste les exigences du cahier des charges (`PAY-03`), et chaque spec nomme les siennes (`**Product Requirements**:`). L'état d'une exigence se déduit du statut de ses specs, jamais écrit à la main ; `spec:trace` affiche le tableau et refuse une exigence inconnue. Voir [l'index des exigences](docs/guides/spec-kit.md#index-des-exigences).
- **Constitution** : `.specify/memory/constitution.md`, résumé des principes de ce fichier, qui fait foi. Une règle change ici d'abord, puis dans la constitution (`/speckit-constitution`).
- **Ne jamais éditer à la main** `.specify/presets/` ni `.claude/skills/speckit-*` : ils sont regénérés depuis `tools/spec-kit/preset/`. Personnaliser, utiliser un autre agent, mettre à jour Spec Kit : voir [le guide](docs/guides/spec-kit.md).

## Principes non négociables

1. Toute table métier a une colonne `tenant_id`, et aucun repository ne lit ni n'écrit sans ce filtre. Le tenant vient de `RequestContext`, jamais d'un paramètre de requête.
2. Toute erreur métier est une sous-classe d'`AppError` avec un code stable en union littérale. `throw new Error()` est interdit hors `infra/` et du démarrage. La conversion en HTTP (RFC 9457) se fait uniquement dans `ProblemDetailsFilter`.
3. Toute route est authentifiée par défaut ; `@Public()` est l'unique exception explicite. Toute route qui modifie des données partagées du tenant déclare son rôle (`@RequireRole`).
4. Toute clé Redis a un TTL ; tout appel externe a un timeout, et passe par une queue s'il est lent.
5. Les migrations sont générées (`db-generate`), jamais éditées à la main, et rétrocompatibles (expand/contract).
6. Toute nouvelle fonctionnalité passe derrière un feature flag (désactivé par défaut), côté API comme côté front (voir `apps/web/AGENTS.md`).

## Conventions

- Validation : schéma zod dans `libs/shared/contracts`, DTO via `createZodDto` dans `http/`, réponse via `@ZodSerializerDto`.
- Persistance : un mapper par agrégat dans `infra/` (`<Agrégat>Mapper extends PersistenceMapper<Agrégat, Row>`), qui reconstruit via `restore`. Le repository ne fait aucune conversion lui-même.
- Identifiants métier : `<PRÉFIXE>-<suffixe>` (`PRD-…`, `ORD-…`), générés par `domainIdGenerator` (api-core) et validés par `domainIdSchema` (contracts). Le suffixe commence par l'horodatage, donc les IDs se trient par création. Préfixe déclaré une fois dans les contrats du domaine (`ORDER_ID_PREFIX`). En base : `text COLLATE "C"`. `tenantId` et les IDs d'utilisateur restent des UUID : ils viennent du fournisseur d'identité.
- Idempotence : toute route qui crée une ressource à effet métier (commande, paiement…) porte `@Idempotent({ required: true })`. Le client envoie `Idempotency-Key` (UUID) et peut réessayer : même clé et même requête → réponse rejouée (`Idempotent-Replayed: true`), même clé et requête différente → 422. La clé est écrite dans la même transaction que l'effet ; une erreur ne la consomme pas.
- Verrou optimiste : tout agrégat modifiable a une colonne `version`. Le repository n'écrit que si la version n'a pas bougé (sinon `<AGRÉGAT>_VERSION_CONFLICT`, 409) puis appelle `markPersisted()`. Si des clients éditent la ressource, exposer `version` et `ETag` (`etagFor`), lire `If-Match` (`@IfMatchVersion()`) et appeler `assertExpectedVersion` dans le cas d'usage (412). Une projection (ex. `soldCount`) n'avance pas la version.
- Feature flags : déclarés dans `FEATURE_FLAGS` (contracts) avec une description, une valeur par défaut et `client` (exposé au front par `GET /api/v1/feature-flags`). Une route derrière un flag porte `@RequireFeature('<flag>')` (404 `FEATURE_DISABLED` quand il est coupé) ; ailleurs, injecter `FeatureFlags` et appeler `isEnabled`. La définition d'un flag se lit par `featureFlagDefinition(flag)`, pas `FEATURE_FLAGS[flag]` : le catalogue peut être vide. Valeurs surchargées par `FEATURE_FLAGS=mon.flag=false,...` (un nom inconnu bloque le démarrage). Tests : `StaticFeatureFlags` (`api-core/testing`), en e2e via `overrideProvider(FeatureFlags)` ; les tests du mécanisme (core, data-access, web) n'utilisent pas les flags du projet. Une fois la fonctionnalité déployée partout, supprimer le flag.
- Argent : entier en unités mineures (`amountMinor`) + devise ISO. Jamais de flottant.
- Pagination : par curseur (`limit`, `cursor` → `items`, `nextCursor`), triée par `(created_at, id)` décroissants.
- API versionnée par URI : `/api/v1/...`. `/health` et `/ready` restent hors préfixe.
- Tests : unitaires sur `domain/` et `application/` (fake en mémoire, pas de mock d'ORM), intégration sur un vrai Postgres, e2e via `configureApp` + supertest.

## Pièges connus

- `@nestjs/swagger` reste en v11 tant que NestJS est en v11 (la v12 exige NestJS 12).
- Node 24 LTS est requis (`.nvmrc`, `engines`) : `nvm use` à l'entrée du repo. pnpm est épinglé via `packageManager` (corepack).
- `jose` v6 est en ESM uniquement, chargé par `require` (natif et sans avertissement depuis Node 24).
- Build de l'API : `importHelpers` est désactivé pour le bundle, car le `package.json` généré ne liste que les modules importés (pas `tslib`). Un nouveau point d'entrée s'ajoute dans `additionalEntryPoints` (`apps/api/webpack.config.js`) et dans `knip.json`.
- `better-auth` déclare en peers optionnels ses adapters et intégrations (drizzle, prisma, vitest, react…) : pnpm lui rattache ceux de la racine. Les images s'installent avec `--no-optional` (sinon celle du service d'auth double de taille) et l'audit ignore une faille du serveur de dev d'esbuild arrivée par ce chemin. Pas de `.pnpmfile.cjs` : Renovate l'ignore (`--ignore-pnpmfile`) et ses lockfiles ne correspondraient plus.
- `@sentry/node` 11 dépend de `@sentry/bundler-plugins` (webpack, esbuild, swc) pour ses plugins de bundler : retiré par une override dans `pnpm-workspace.yaml`, sinon l'image de prod prend ~100 Mo d'outils de build. Ne pas importer `@sentry/node/bundler-plugin/*`.
- `pg` : un `Pool` sans écouteur `error` fait planter le process quand Postgres coupe une connexion inactive (redémarrage, bascule). Tout nouveau pool en déclare un.
- BullMQ v6 : `ioredis` est une dépendance optionnelle chargée à la demande, et un ID de job ne peut pas contenir `:`.
- nodemailer : le second argument de `createTransport` contient les valeurs par défaut des messages, pas les options de transport (timeouts, URL).
- Une classe de base abstraite injectée par héritage doit porter `@Injectable()`, sinon Nest ne voit pas les dépendances de son constructeur.
- `pnpm strip:examples` traite toute ligne qui ne contient qu'un marqueur `example:start` ou `example:end` (en commentaire), y compris dans un template literal de test, partout sauf dans ses propres fichiers et `docs/archive`. Un test qui a besoin de ces marqueurs les construit par interpolation (``const START = `// example:${'start'}`;``), sinon `strip:examples` retire ou rejette sa fixture.
