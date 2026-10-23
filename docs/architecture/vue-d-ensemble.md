# Architecture : vue d'ensemble

Comment les morceaux du boilerplate s'assemblent. Chaque règle évoquée ici est détaillée dans [`AGENTS.md`](../../AGENTS.md), qui fait foi ; cette page donne la carte.

## Services

```mermaid
flowchart LR
  browser[Navigateur<br>apps/web]
  auth[Service d'identité<br>apps/auth · Better Auth]
  api[API HTTP<br>apps/api · main.js]
  worker[Worker<br>apps/api · worker.js]
  pg[(Postgres<br>un schéma par domaine)]
  redis[(Redis<br>BullMQ, rate limit)]
  smtp[SMTP]

  browser -- "cookie de session<br>GET /api/auth/token" --> auth
  browser -- "Bearer JWT (15 min)" --> api
  api -- "JWKS (clés publiques)" --> auth
  auth --> pg
  api --> pg
  api --> redis
  worker --> pg
  worker --> redis
  worker --> smtp
  auth --> smtp
```

- **`apps/web`** : une SPA React (Vite) qui ne parle qu'à deux services. Elle obtient un access token du service d'identité avec son cookie de session, le garde en mémoire et l'envoie à l'API.
- **`apps/auth`** : Better Auth dans son propre process. Il gère les comptes, les organisations (une organisation = un tenant) et signe les JWT, et il expose ses clés publiques (JWKS). Ses tables sont dans le schéma Postgres `auth`.
- **`apps/api`** : une seule image, trois commandes. `main.js` sert le HTTP, `worker.js` fait tourner le relais de l'outbox et les handlers d'événements, `migrate.js` applique les migrations au déploiement. En dev, `nx serve api` fait tout dans un seul process.
- **Postgres** : chaque domaine a son schéma, du nom du domaine (`pgSchema('<domaine>')`), sans jointure ni clé étrangère vers un autre domaine. `api-core` y ajoute `messaging` (outbox, marques d'idempotence des handlers) et `idempotency` (réponses rejouées des routes `@Idempotent`).
- **Redis** : files BullMQ et compteurs du rate limiting. Toute clé a un TTL.

## Les libs et leurs dépendances

```mermaid
flowchart TB
  subgraph api_side[API]
    apiapp[apps/api<br>bootstrap, AppModule, migrations]
    domains["libs/api/&lt;domaine&gt;<br>domain · application · infra · http"]
    core[libs/api/core<br>config, auth, contexte, DB, outbox, email, erreurs]
  end
  subgraph web_side[Front]
    webapp[apps/web<br>routes, layout]
    features["libs/web/&lt;feature&gt;<br>écrans, données"]
    da[libs/web/data-access<br>client API, React Query]
    ui[libs/web/ui<br>design system]
  end
  contracts[libs/shared/contracts<br>schémas zod, événements, flags]

  apiapp --> domains --> core
  domains --> contracts
  core --> contracts
  webapp --> features --> da --> contracts
  features --> ui
  webapp --> ui
```

Les tags Nx (`scope:*`, `type:*`) font respecter ces flèches au lint. Un domaine n'importe d'un autre domaine que sa façade (`index.ts`), à travers un port et un adapter. `core` ne connaît aucun domaine. Le front et l'API partagent les schémas des contrats : une entrée validée par le formulaire l'est aussi par l'API.

## Le trajet d'une requête

```mermaid
sequenceDiagram
  participant W as apps/web
  participant G as Guards (api-core)
  participant C as Controller
  participant U as Cas d'usage
  participant R as Repository
  W->>G: POST /api/v1/… (Bearer, Idempotency-Key)
  G->>G: AuthGuard (JWT, JWKS) → RequestContext
  G->>G: ThrottlerGuard → FeatureFlagsGuard (404) → RolesGuard (403)
  G->>C: DTO validé (zod)
  C->>U: execute(input)
  U->>U: règles d'accès (RequestContext.userId, hasRole)
  U->>R: lecture / écriture
  R->>R: filtre tenant_id = RequestContext.tenantId
  U-->>C: agrégat
  C-->>W: réponse sérialisée (zod)
  Note over C,W: une AppError devient un problème RFC 9457<br>dans ProblemDetailsFilter
```

Le tenant ne vient jamais de la requête : il est lu dans le token et placé dans `RequestContext` (AsyncLocalStorage). Chaque repository filtre dessus. Une ressource qu'on n'a pas le droit de voir répond 404, comme si elle n'existait pas.

## Le trajet d'un événement

```mermaid
sequenceDiagram
  participant U as Cas d'usage
  participant DB as Postgres
  participant Rel as Relais (worker)
  participant Q as BullMQ (Redis)
  participant H as Handler (worker)
  U->>DB: transaction : écriture métier + ligne d'outbox
  Rel->>DB: lit l'outbox (SKIP LOCKED)
  Rel->>Q: un job par (événement, handler)
  Q->>H: job
  H->>H: RequestContext = tenant et auteur de l'événement
  H->>DB: effet + marque d'idempotence (même transaction)
  Note over H: échec → 10 tentatives, backoff exponentiel<br>handler externe (email) : transactional false,<br>event.id comme clé d'idempotence
```

L'événement est écrit dans la même transaction que la donnée métier : il n'y a pas d'événement sans effet, ni d'effet sans événement. La livraison est garantie au moins une fois, et la marque d'idempotence ne laisse passer qu'une fois un effet en base. Un domaine qui réagit ne dépend que du contrat de l'événement (`libs/shared/contracts`), jamais du domaine émetteur.

## Ce qui est transverse (`api-core`)

| Besoin                          | Ce qu'on utilise                                                                                                 |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Qui appelle, pour quel tenant   | `RequestContext` (`userId`, `tenantId`, `hasRole`, `principal.email`)                                            |
| Route publique ou réservée      | `@Public()`, `@RequireRole('staff')`                                                                             |
| Fonctionnalité derrière un flag | `@RequireFeature('<flag>')`, `FeatureFlags.isEnabled`                                                            |
| Création rejouable sans doublon | `@Idempotent({ required: true })`                                                                                |
| Transaction, outbox             | `TransactionManager`, `Outbox.publish`, `@OnIntegrationEvent`                                                    |
| Email                           | `Mailer` (SMTP, ou journalisé sans `SMTP_URL`)                                                                   |
| Erreur métier                   | sous-classe d'`AppError` ; conversion HTTP dans `ProblemDetailsFilter`                                           |
| Pagination, verrou optimiste    | `encodeCursor`/`decodeCursor`, colonne `version`, `assertExpectedVersion`                                        |
| Identifiants métier             | `domainIdGenerator('<PRÉFIXE>')`                                                                                 |
| Tests                           | `api-core/testing` : bases jetables, tokens, fakes (`RecordingOutbox`, `RecordingMailer`, `StaticFeatureFlags`…) |

## Pour aller plus loin

- En détail, avec les raisons des choix et les limites : [Authentification](authentification.md), [Outbox et événements](outbox-et-evenements.md), [Multi-tenant et autorisations](multi-tenant-et-autorisations.md).
- Pourquoi ces choix : les [décisions d'architecture (ADR)](adr/README.md).
- Écrire un domaine, fichier par fichier : [Référence : un domaine de l'API](../reference/domaine-api.md).
- Écrire un écran : [Référence : une lib feature du front](../reference/feature-web.md).
- Déploiement, sondes, arrêt : [Déployer](../guides/deployer.md).
- Les notions employées ici (monolithe modulaire, DDD, hexagonal, outbox…) et où les apprendre : [Notions et ressources](../notions.md).
- Observabilité : [Observabilité en local](../guides/observabilite-en-local.md) et [Référence : métriques et alertes](../reference/metriques-et-alertes.md).
