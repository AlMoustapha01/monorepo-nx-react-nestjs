# Notions et ressources

Les notions sur lesquelles repose le boilerplate, chacune avec l'endroit où elle apparaît ici et de quoi l'apprendre. La documentation du repo explique comment elles sont appliquées, pas les notions elles-mêmes : cette page fait le lien.

Les ressources sont en anglais sauf mention contraire. On privilégie la source : la spécification, la documentation officielle ou l'article qui a nommé l'idée.

## Par où commencer

Pour qui découvre le repo, dans cet ordre :

1. [Monorepo et Nx](#monorepo-et-nx), puis [NestJS](#nestjs) : la forme du code.
2. [Monolithe modulaire, DDD, hexagonal](#architecture-de-lapi) : pourquoi un domaine est découpé ainsi.
3. [Multi-tenant](#multi-tenant-et-autorisations) et [JWT](#authentification) : ce que chaque requête porte.
4. [Outbox transactionnelle](#événements-et-fiabilité) : comment les domaines réagissent les uns aux autres.
5. [TDD et niveaux de tests](#tests), puis [Spec Kit](#méthode) : comment on livre une fonctionnalité.

Le reste au besoin, quand on touche au sujet.

## Monorepo et Nx

- **Monorepo** : toutes les applications et libs dans un seul dépôt, avec des frontières vérifiées par l'outillage plutôt que par des dépôts séparés.
  Ici : `apps/`, `libs/`, les tags `scope:*` et `type:*` des `project.json`.
  Apprendre : [What is a Monorepo?](https://nx.dev/docs/kb/what-is-a-monorepo) (Nx).
- **Nx** : orchestre les tâches (lint, tests, build) du monorepo, les met en cache et ne relance que les projets touchés par un changement.
  Ici : `pnpm nx serve api`, `nx affected` en CI ([Intégration continue](guides/ci.md)).
  Apprendre : [What is Nx?](https://nx.dev/docs/getting-started/intro), [Run only tasks affected by a PR](https://nx.dev/docs/features/ci-features/affected), [Enforce module boundaries](https://nx.dev/docs/features/enforce-module-boundaries).
- **pnpm et workspaces** : gestionnaire de paquets à stockage partagé, strict sur les dépendances non déclarées.
  Ici : `pnpm-workspace.yaml` (overrides, audit).
  Apprendre : [Motivation](https://pnpm.io/motivation), [Workspace](https://pnpm.io/workspaces).

## Architecture de l'API

- **Monolithe modulaire** : un seul déployable, découpé en modules aux frontières strictes, qu'on pourrait extraire plus tard.
  Ici : un domaine = une lib Nx ([ADR 0001](architecture/adr/0001-monolithe-modulaire.md)).
  Apprendre : [Modular Monolith: A Primer](https://www.kamilgrzybek.com/blog/posts/modular-monolith-primer) (Kamil Grzybek), [Monolith First](https://martinfowler.com/bliki/MonolithFirst.html) (Martin Fowler).
- **Domain-Driven Design (DDD)** : modéliser le code sur le métier ; un _bounded context_ a son propre modèle et son vocabulaire ; un _agrégat_ est un groupe d'objets modifié d'un bloc, qui garantit ses règles.
  Ici : `libs/api/<domaine>/src/lib/domain/`, [Référence : un domaine de l'API](reference/domaine-api.md).
  Apprendre : [Domain Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html), [Bounded Context](https://martinfowler.com/bliki/BoundedContext.html), [DDD Aggregate](https://martinfowler.com/bliki/DDD_Aggregate.html) (Martin Fowler).
- **Architecture hexagonale (ports et adapters)** : le métier déclare ce dont il a besoin (un port), l'infrastructure le fournit (un adapter) ; le métier ne dépend d'aucun framework.
  Ici : ports dans `application/`, adapters Drizzle dans `infra/`, `domain/` sans NestJS ni Drizzle (lint).
  Apprendre : [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture) (Alistair Cockburn, qui l'a nommée).
- **Façade** : le seul point d'entrée public d'un domaine ; les autres domaines ne voient rien d'autre.
  Ici : `src/index.ts` de chaque domaine, [Vue d'ensemble](architecture/vue-d-ensemble.md).
- **Schéma Postgres par domaine** : chaque domaine possède ses tables dans son propre espace de noms, sans clé étrangère vers un autre.
  Ici : `pgSchema('<domaine>')`, [ADR 0002](architecture/adr/0002-schema-postgres-par-domaine.md).
  Apprendre : [Schemas](https://www.postgresql.org/docs/current/ddl-schemas.html) (documentation Postgres).

## NestJS

- **Modules, providers, injection de dépendances** : la structure d'une application Nest ; un module déclare ce qu'il fournit et ce qu'il importe.
  Ici : le module de chaque domaine, `CoreModule` (`libs/api/core/src/lib/core.module.ts`).
  Apprendre : [Documentation NestJS](https://docs.nestjs.com/), en particulier [Modules](https://docs.nestjs.com/modules) et [Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events).
- **Contexte de requête (AsyncLocalStorage)** : des données propres à la requête (tenant, utilisateur) accessibles partout sans les passer en paramètre.
  Ici : `RequestContext` (`libs/api/core/src/lib/context/request-context.ts`), sur nestjs-cls.
  Apprendre : [Asynchronous context tracking](https://nodejs.org/api/async_context.html) (Node.js), [Async Local Storage](https://docs.nestjs.com/recipes/async-local-storage) (NestJS), [nestjs-cls](https://papooch.github.io/nestjs-cls/).
- **Validation par schéma (zod)** : un schéma décrit une donnée, la valide et en déduit le type TypeScript ; le même schéma sert au front et à l'API.
  Ici : `libs/shared/contracts`, DTO `createZodDto`.
  Apprendre : [Zod](https://zod.dev/), [nestjs-zod](https://github.com/BenLorantfy/nestjs-zod), [OpenAPI dans NestJS](https://docs.nestjs.com/openapi/introduction) (document servi sur `/api/docs-json`, affiché par [Scalar](https://scalar.com) sur `/api/docs`).
- **Drizzle ORM** : un ORM proche du SQL, dont le schéma est écrit en TypeScript et d'où sont générées les migrations.
  Ici : `*.schema.ts` dans `infra/`, `pnpm nx run api:db-generate`.
  Apprendre : [Why Drizzle?](https://orm.drizzle.team/docs/overview), [Schemas](https://orm.drizzle.team/docs/schemas) (Drizzle).

## Authentification

- **JWT** : un jeton signé qui porte des affirmations (_claims_) sur l'utilisateur ; on le vérifie sans appeler son émetteur.
  Ici : `libs/api/core/src/lib/auth/jwt-verifier.ts`, [Authentification](architecture/authentification.md).
  Apprendre : [JSON Web Token Introduction](https://www.jwt.io/introduction) (jwt.io).
- **JWKS et EdDSA** : l'émetteur publie ses clés publiques (JWK Set), le vérificateur les télécharge et les met en cache ; EdDSA (Ed25519) est l'algorithme de signature.
  Ici : `AUTH_JWKS_URL`, la bibliothèque jose.
  Apprendre : [JSON Web Key Sets](https://auth0.com/docs/secure/tokens/json-web-tokens/json-web-key-sets) (Auth0), [RFC 7517](https://www.rfc-editor.org/rfc/rfc7517) (JWK), [RFC 8037](https://www.rfc-editor.org/rfc/rfc8037) (EdDSA dans JOSE), [jose](https://github.com/panva/jose).
- **Better Auth** : la bibliothèque du service d'identité : comptes, sessions, organisations, émission des JWT.
  Ici : `apps/auth`, [Authentification en local](guides/auth-en-local.md).
  Apprendre : [Introduction](https://www.better-auth.com/docs/introduction), plugins [Organization](https://www.better-auth.com/docs/plugins/organization) et [JWT](https://www.better-auth.com/docs/plugins/jwt).
- **Cookies de session et SameSite** : le cookie de session du service d'identité n'est envoyé que depuis le même site, ce qui protège du CSRF et impose que front et service d'identité partagent un site.
  Ici : [Déployer](guides/deployer.md) (build du front).
  Apprendre : [SameSite cookies explained](https://web.dev/articles/samesite-cookies-explained) (web.dev), [Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) (OWASP).

## Multi-tenant et autorisations

- **Multi-tenant en base partagée** : tous les clients (tenants) dans les mêmes tables, séparés par une colonne `tenant_id` filtrée à chaque requête.
  Ici : [Multi-tenant et autorisations](architecture/multi-tenant-et-autorisations.md), [ADR 0003](architecture/adr/0003-multi-tenant-base-partagee.md).
  Apprendre : [Tenancy models](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/considerations/tenancy-models) (Azure Architecture Center), [Tenant isolation](https://docs.aws.amazon.com/whitepapers/latest/saas-architecture-fundamentals/tenant-isolation.html) (AWS).
- **Rôles et contrôle d'accès** : un rôle donne des droits sur des routes ; l'accès à une ressource précise est une règle métier ; ce qu'on ne peut pas voir répond 404.
  Ici : `@RequireRole`, `RolesGuard` (`libs/api/core/src/lib/auth/roles.guard.ts`).
  Apprendre : [Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) (OWASP).

## Événements et fiabilité

- **Outbox transactionnelle** : l'événement est écrit dans la même transaction que la donnée métier, puis publié par un relais ; on ne perd ni n'invente d'événement.
  Ici : `libs/api/core/src/lib/events/outbox.ts` et `outbox-relay.ts`, [Outbox et événements](architecture/outbox-et-evenements.md), [ADR 0005](architecture/adr/0005-outbox-et-bullmq.md).
  Apprendre : [Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) (Chris Richardson), [`FOR UPDATE SKIP LOCKED`](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) (Postgres, utilisé par le relais).
- **Consommateur idempotent et livraison au moins une fois** : un message peut arriver deux fois ; le consommateur garde une marque pour n'appliquer son effet qu'une fois.
  Ici : `processed_events`, `transactional: false`.
  Apprendre : [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html) (Chris Richardson).
- **Files de jobs (BullMQ)** : des jobs stockés dans Redis, traités par des workers, réessayés avec un délai croissant (_backoff exponentiel_).
  Ici : `libs/api/core/src/lib/events/integration-event.queue.ts`, `worker.ts`.
  Apprendre : [What is BullMQ](https://docs.bullmq.io/), [Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs), [Going to production](https://docs.bullmq.io/guide/going-to-production) (BullMQ).
- **Clé d'idempotence HTTP** : le client joint une clé à une requête qui crée quelque chose ; s'il la renvoie, il obtient la même réponse au lieu d'un doublon.
  Ici : `@Idempotent` (`libs/api/core/src/lib/http/idempotency/`), `useIdempotentMutation` côté front.
  Apprendre : [Designing robust and predictable APIs with idempotency](https://stripe.com/blog/idempotency) (Stripe), [The Idempotency-Key HTTP header](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/) (brouillon IETF).
- **Verrou optimiste, ETag et If-Match** : on n'écrit que si la version lue n'a pas changé ; le client HTTP reçoit la version en `ETag` et la renvoie en `If-Match`.
  Ici : colonne `version`, `libs/api/core/src/lib/http/entity-version.ts`.
  Apprendre : [Optimistic Offline Lock](https://martinfowler.com/eaaCatalog/optimisticOfflineLock.html) (Martin Fowler), [Conditional requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Conditional_requests), [ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag) et [412](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/412) (MDN).

## Conception d'API HTTP

- **Erreurs RFC 9457 (_problem details_)** : un format JSON standard pour les réponses en erreur, avec un code stable que le client peut tester.
  Ici : `libs/api/core/src/lib/errors/problem-details.filter.ts`, [Codes d'erreur](reference/codes-erreur.md), [ADR 0009](architecture/adr/0009-erreurs-rfc-9457.md).
  Apprendre : [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) ; pour les statuts et les en-têtes, [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) (sémantique HTTP).
- **Pagination par curseur** : on reprend après le dernier élément vu plutôt qu'à un décalage ; stable quand des lignes sont ajoutées, et rapide sur une grande table.
  Ici : `libs/api/core/src/lib/http/cursor.ts`.
  Apprendre : [No offset](https://use-the-index-luke.com/no-offset) (Markus Winand).
- **Identifiants triables** : un identifiant qui commence par un horodatage se trie par date de création ; le préfixe dit de quel objet il s'agit.
  Ici : `<PRÉFIXE>-<suffixe>` (`libs/api/core/src/lib/ids/domain-id.ts`), [ADR 0004](architecture/adr/0004-identifiants-metier-prefixes.md).
  Apprendre : [ULID](https://github.com/ulid/spec), la même idée sans préfixe.
- **Rate limiting** : limiter le nombre de requêtes par client et par fenêtre de temps ; au-delà, 429 et `Retry-After`.
  Ici : `libs/api/core/src/lib/http/rate-limit/`.
  Apprendre : [429 Too Many Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429) (MDN), [Denial of Service Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Denial_of_Service_Cheat_Sheet.html) (OWASP).
- **Feature flags** : livrer du code désactivé, l'activer par configuration, puis retirer le flag.
  Ici : `FEATURE_FLAGS` (`libs/shared/contracts/src/lib/feature-flags.ts`), [ADR 0008](architecture/adr/0008-feature-flags-dans-le-code.md).
  Apprendre : [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) (Pete Hodgson, sur le site de Martin Fowler).

## Exploitation

- **Twelve-Factor App** : des principes pour une application déployable partout : configuration par l'environnement, processus sans état, tâches d'administration (migrations) lancées à part.
  Ici : [Variables d'environnement](reference/variables-environnement.md), `migrate.js` ([ADR 0007](architecture/adr/0007-une-image-trois-commandes.md)).
  Apprendre : [The Twelve-Factor App](https://12factor.net/), en particulier [Config](https://12factor.net/config) et [Admin processes](https://12factor.net/admin-processes) ; [en français](https://12factor.net/fr/).
- **Migrations expand/contract** : changer un schéma en plusieurs déploiements, chacun compatible avec le code de l'étape précédente.
  Ici : [Déployer](guides/deployer.md), principe 5 d'`AGENTS.md`.
  Apprendre : [Parallel Change](https://martinfowler.com/bliki/ParallelChange.html) (Martin Fowler), [Using the expand and contract pattern](https://www.prisma.io/dataguide/types/relational/expand-and-contract-pattern) (Prisma).
- **Sondes et arrêt progressif** : _liveness_ (le process répond), _readiness_ (il peut recevoir du trafic) ; à l'arrêt, sortir du load balancer avant de couper.
  Ici : `/health`, `/ready`, `libs/api/core/src/lib/lifecycle/graceful-shutdown.ts`.
  Apprendre : [Configure liveness, readiness and startup probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/), [Pod termination](https://kubernetes.io/docs/concepts/workloads/pods/pod-lifecycle/#pod-termination) (Kubernetes).
- **Images Docker multi-étapes** : construire dans une étape, ne copier que le résultat dans l'image finale.
  Ici : `Dockerfile`.
  Apprendre : [Multi-stage builds](https://docs.docker.com/build/building/multi-stage/) (Docker).
- **Persistance de Redis** : sans persistance (AOF) ni politique `noeviction`, Redis peut perdre ou évincer des jobs.
  Apprendre : [Redis persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/), [Going to production](https://docs.bullmq.io/guide/going-to-production) (BullMQ).

## Observabilité

- **OpenTelemetry** : un standard ouvert pour produire traces, métriques et logs, indépendant de l'outil qui les stocke.
  Ici : `apps/api/src/instrumentation.ts`, [Observabilité en local](guides/observabilite-en-local.md).
  Apprendre : [Concepts](https://opentelemetry.io/docs/concepts/), [Traces](https://opentelemetry.io/docs/concepts/signals/traces/) (OpenTelemetry).
- **Propagation du contexte (W3C Trace Context)** : l'identifiant de trace voyage avec la requête, et ici avec l'événement dans l'outbox, pour relier tout ce qu'elle a déclenché.
  Ici : `libs/api/core/src/lib/events/trace-context.ts`.
  Apprendre : [Trace Context](https://www.w3.org/TR/trace-context/) (W3C).
- **Métriques, PromQL et alertes** : ce qu'on mesure, comment l'interroger, sur quoi alerter.
  Ici : [Métriques et alertes](reference/metriques-et-alertes.md).
  Apprendre : [Querying basics](https://prometheus.io/docs/prometheus/latest/querying/basics/) (Prometheus), [Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) (Google SRE Book, les « quatre signaux »).
- **Logs structurés** : des logs JSON, chaque ligne avec `trace_id` et `span_id`, et celles d'une requête HTTP avec son identifiant.
  Apprendre : [Pino](https://getpino.io/).
- **Suivi d'erreurs** : Sentry regroupe les erreurs inattendues avec leur contexte.
  Apprendre : [Sentry for Node.js](https://docs.sentry.io/platforms/javascript/guides/node/).

## Front

- **React et React Compiler** : la bibliothèque d'interface ; le compilateur mémoïse les composants à la place de `useMemo` et `useCallback`.
  Ici : `apps/web`, [ADR 0010](architecture/adr/0010-stack-du-front.md).
  Apprendre : [Quick Start](https://react.dev/learn), [React Compiler](https://react.dev/learn/react-compiler) (React).
- **Vite** : serveur de dev et build du front.
  Apprendre : [Getting Started](https://vite.dev/guide/) (Vite).
- **TanStack Router** : routage typé, routes déclarées par fichier, paramètres d'URL validés.
  Ici : `apps/web/src/routes`.
  Apprendre : [Overview](https://tanstack.com/router/latest/docs/overview) (TanStack Router).
- **TanStack Query** : cache de l'état serveur : chargement, invalidation, nouvelles tentatives.
  Ici : `libs/web/data-access`, [Référence : une lib feature du front](reference/feature-web.md).
  Apprendre : [Overview](https://tanstack.com/query/latest/docs/framework/react/overview) (TanStack Query), [Practical React Query](https://tkdodo.eu/blog/practical-react-query) (TkDodo, l'un des mainteneurs ; toute sa série vaut la lecture).
- **Formulaires** : react-hook-form, validé par les schémas zod des contrats.
  Apprendre : [Get Started](https://react-hook-form.com/get-started) (React Hook Form).
- **Design system** : Tailwind pour le style, des composants shadcn/ui copiés dans le repo, documentés dans Storybook.
  Ici : `libs/web/ui`.
  Apprendre : [Tailwind CSS](https://tailwindcss.com/docs), [shadcn/ui](https://ui.shadcn.com/docs), [Storybook](https://storybook.js.org/docs).
- **Internationalisation** : des messages extraits du code dans des catalogues traduits.
  Ici : `apps/web/src/i18n`, `src/locales`.
  Apprendre : [Introduction](https://lingui.dev/introduction) (Lingui).
- **Accessibilité** : une interface utilisable au clavier et par les lecteurs d'écran ; le lint (jsx-a11y) et un parcours e2e la vérifient en partie.
  Apprendre : [Introduction to Web Accessibility](https://www.w3.org/WAI/fundamentals/accessibility-intro/) (W3C WAI), [en français](https://www.w3.org/WAI/fundamentals/accessibility-intro/fr).

## Tests

- **TDD** : écrire le test, le voir échouer, écrire le code qui le fait passer, puis nettoyer.
  Ici : obligatoire dans le cycle Spec Kit ([ADR 0011](architecture/adr/0011-developpement-par-specs.md)).
  Apprendre : [Test Driven Development](https://martinfowler.com/bliki/TestDrivenDevelopment.html) (Martin Fowler).
- **Niveaux de tests** : beaucoup de tests unitaires rapides, moins de tests d'intégration, peu de parcours de bout en bout.
  Ici : unitaires sur `domain/` et `application/` avec des fakes, intégration sur un vrai Postgres, e2e HTTP (supertest) et navigateur (Playwright).
  Apprendre : [Test Pyramid](https://martinfowler.com/bliki/TestPyramid.html) (Martin Fowler).
- **Vitest et Testing Library** : le lanceur de tests ; tester un composant comme l'utilisateur s'en sert, pas par ses détails internes.
  Apprendre : [Vitest](https://vitest.dev/guide/), [Guiding Principles](https://testing-library.com/docs/guiding-principles/) (Testing Library), [Mock Service Worker](https://mswjs.io/docs/) (simuler l'API dans les tests du front).
- **Testcontainers** : démarrer de vrais Postgres, Redis et Mailpit dans Docker le temps d'un test.
  Ici : `*.int.spec.ts`, `apps/api/tests`, `apps/web-e2e`.
  Apprendre : [What is Testcontainers](https://testcontainers.com/guides/introducing-testcontainers/), [Testcontainers for Node.js](https://node.testcontainers.org/).
- **Playwright** : piloter un vrai navigateur pour tester un parcours ; en échec, la trace rejoue chaque étape.
  Ici : `apps/web-e2e`.
  Apprendre : [Installation](https://playwright.dev/docs/intro), [Trace viewer](https://playwright.dev/docs/trace-viewer) (Playwright).

## Qualité et CI

- **Intégration continue** : chaque PR est vérifiée automatiquement avant d'être mergée.
  Ici : [Intégration continue](guides/ci.md).
  Apprendre : [Understanding GitHub Actions](https://docs.github.com/en/actions/get-started/understand-github-actions), [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use) (épinglage des actions par SHA) (GitHub).
- **Lint, formatage, code mort** : Oxlint et Oxfmt (rapides, compatibles ESLint et Prettier), knip pour les exports et dépendances inutilisés, size-limit pour le poids du JS.
  Apprendre : [Oxlint](https://oxc.rs/docs/guide/usage/linter.html), [Oxfmt](https://oxc.rs/docs/guide/usage/formatter.html), [Knip](https://knip.dev/), [size-limit](https://github.com/ai/size-limit).
- **Mises à jour de dépendances** : Renovate ouvre les PR de mise à jour.
  Ici : [Dépendances et failles](guides/dependances.md).
  Apprendre : [Renovate Docs](https://docs.renovatebot.com/).

## Méthode

- **Développement par specs (Spec Kit)** : décrire le quoi et le pourquoi avant le comment, puis planifier, découper en tâches et implémenter avec un agent.
  Ici : [Spec Kit : cycle de vie et maintenance](guides/spec-kit.md), [Votre première fonctionnalité](tutorial/premiere-fonctionnalite.md).
  Apprendre : [Spec Kit](https://github.com/github/spec-kit) et [Spec-Driven Development](https://github.com/github/spec-kit/blob/main/spec-driven.md), la méthode qu'il outille.
- **ADR** : une décision d'architecture par fichier, avec son contexte et ses conséquences.
  Ici : [Décisions d'architecture](architecture/adr/README.md).
  Apprendre : [Documenting Architecture Decisions](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions) (Michael Nygard, l'article d'origine), [adr.github.io](https://adr.github.io/).
- **Conventional Commits** : un format de message de commit (`feat:`, `fix:`, `docs:`…) lisible par les outils.
  Apprendre : [Conventional Commits](https://www.conventionalcommits.org/fr/v1.0.0/) (en français).
