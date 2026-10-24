# Référence : variables d'environnement

Toutes les variables lues par l'API, le worker, le service d'identité, le front et les outils de dev. Pour savoir quoi régler en production et pourquoi, lire [Déployer](../guides/deployer.md).

- **Validation** : l'API et le worker valident leur environnement avec `libs/api/core/src/lib/config/env.ts`, le service d'identité avec `apps/auth/src/env.ts`. Une variable absente ou invalide empêche le démarrage, avec son nom dans le message.
- **En dev** : un fichier par app et un fichier commun, créés depuis leur `.env.example` par `pnpm dev:setup` :
  - `.env` à la racine : ce que plusieurs apps ou docker compose lisent (infra, `DATABASE_URL`, SMTP, contrat des tokens `AUTH_JWT_ISSUER` et `AUTH_JWT_AUDIENCE`, CORS, arrêt, OTEL et Sentry) ;
  - `apps/api/.env`, `apps/auth/.env` : ce que l'app seule lit (port, secrets, flags). L'app lit son fichier, puis le `.env` commun ; une variable déjà définie n'est pas remplacée : le shell, puis le fichier de l'app, l'emportent ;
  - `apps/web/.env` : les `VITE_*`, seul fichier lu par Vite.

  Les scripts de `tools/dev` lisent les trois fichiers des apps, puis le commun. Un ancien `.env` unique est réparti par `pnpm dev:setup`, qui garde l'original dans `.env.backup`. En production, aucun fichier : l'environnement du conteneur.

- **À jour** : un test de chaque projet (`env.spec.ts`) échoue si une variable de son schéma manque dans cette page. Une variable ajoutée au schéma s'ajoute ici, une par ligne.

## API et worker

Les deux process (`main.js` et `worker.js`) lisent les mêmes variables.

### Process

| Variable    | Défaut        | Rôle                                                                     |
| ----------- | ------------- | ------------------------------------------------------------------------ |
| `NODE_ENV`  | `development` | `development`, `test` ou `production` ; l'image Docker pose `production` |
| `PORT`      | `3000`        | port HTTP de l'API ; ignoré par le worker                                |
| `LOG_LEVEL` | `info`        | `fatal`, `error`, `warn`, `info`, `debug`, `trace` ou `silent`           |

### Postgres et Redis

| Variable            | Défaut      | Rôle                                                                                 |
| ------------------- | ----------- | ------------------------------------------------------------------------------------ |
| `DATABASE_URL`      | obligatoire | URL Postgres, partagée avec le service d'identité ; aussi lue par `migrate.js`       |
| `DATABASE_POOL_MAX` | `10`        | connexions maximum par process ; le total des instances reste sous `max_connections` |
| `REDIS_URL`         | obligatoire | jobs BullMQ et compteurs du rate limiting                                            |

### Événements et jobs

| Variable                  | Défaut | Rôle                                                                                                                          |
| ------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `JOBS_ENABLED`            | `true` | relais de l'outbox, worker BullMQ et purge dans ce process ; `false` pour l'API en production, forcé à `true` par `worker.js` |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | intervalle de sondage de l'outbox quand elle est vide ; le relais enchaîne sans attendre tant qu'il reste des événements      |
| `JOBS_CONCURRENCY`        | `5`    | handlers exécutés en parallèle par process worker                                                                             |

### Email

| Variable    | Défaut                       | Rôle                                                                                                                |
| ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `SMTP_URL`  | absent                       | serveur SMTP (`smtp://…` ou `smtps://…`) ; absent, les emails sont seulement journalisés. Obligatoire en production |
| `MAIL_FROM` | `Shop <no-reply@shop.local>` | expéditeur des emails                                                                                               |

### Authentification

| Variable            | Défaut      | Rôle                                                                                                            |
| ------------------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `AUTH_JWKS_URL`     | absent      | clés publiques du fournisseur d'identité (`<service auth>/api/auth/jwks`) ; obligatoire en production           |
| `AUTH_JWT_SECRET`   | absent      | secret HS256, 32 caractères minimum, à la place du JWKS ; dev et tests seulement, partagé avec `pnpm dev:token` |
| `AUTH_JWT_ISSUER`   | obligatoire | `iss` attendu dans les tokens ; même valeur que le service d'identité                                           |
| `AUTH_JWT_AUDIENCE` | obligatoire | `aud` attendu dans les tokens ; même valeur que le service d'identité                                           |
| `AUTH_TENANT_CLAIM` | `tenant_id` | claim qui porte le tenant ; un chemin pointé descend dans un objet                                              |
| `AUTH_ROLES_CLAIM`  | `roles`     | claim qui porte les rôles, ex. `realm_access.roles` pour Keycloak                                               |

### HTTP

| Variable            | Défaut  | Rôle                                                                                                          |
| ------------------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| `CORS_ORIGINS`      | vide    | origines du front autorisées, séparées par des virgules                                                       |
| `RATE_LIMIT_MAX`    | `100`   | requêtes autorisées par fenêtre, par utilisateur ou, sans token, par IP                                       |
| `RATE_LIMIT_TTL_MS` | `60000` | durée de la fenêtre du rate limiting                                                                          |
| `TRUST_PROXY_HOPS`  | `0`     | proxys de confiance devant l'API ; l'IP du client est lue dans `X-Forwarded-For`. 1 derrière un load balancer |

### Arrêt

| Variable              | Défaut  | Rôle                                                                                                    |
| --------------------- | ------- | ------------------------------------------------------------------------------------------------------- |
| `SHUTDOWN_DRAIN_MS`   | `0`     | délai entre SIGTERM et la fermeture, `/ready` en 503 ; 5000 derrière un load balancer, 0 pour le worker |
| `SHUTDOWN_TIMEOUT_MS` | `25000` | au-delà, le process sort en erreur ; inférieur au délai avant SIGKILL de l'orchestrateur                |

### Feature flags

| Variable        | Défaut | Rôle                                                                                                                                                           |
| --------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FEATURE_FLAGS` | vide   | surcharges du catalogue `FEATURE_FLAGS` des contrats : `mon.flag=true,autre.flag=false`. Un nom inconnu ou une valeur autre que booléenne empêche le démarrage |

### Contraintes entre variables

- `AUTH_JWKS_URL` ou `AUTH_JWT_SECRET` : exactement l'un des deux.
- En production : `AUTH_JWT_SECRET` interdit, `SMTP_URL` obligatoire.

## Service d'identité

`apps/auth`. Les variables communes avec l'API (`DATABASE_URL`, `AUTH_JWT_ISSUER`…) gardent le même nom : en dev, elles sont dans le `.env` de la racine, le reste dans `apps/auth/.env`.

| Variable              | Défaut                       | Rôle                                                                                                               |
| --------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`            | `development`                | comme pour l'API                                                                                                   |
| `LOG_LEVEL`           | `info`                       | comme pour l'API                                                                                                   |
| `AUTH_PORT`           | `3100`                       | port HTTP du service                                                                                               |
| `BETTER_AUTH_URL`     | obligatoire                  | URL publique du service, vue par le navigateur : liens des emails, origine des cookies                             |
| `BETTER_AUTH_SECRET`  | obligatoire                  | 32 caractères minimum ; signe les cookies et chiffre les clés privées du JWKS. Le changer rend ces clés illisibles |
| `AUTH_APP_URL`        | obligatoire                  | URL du front, pour les liens d'invitation                                                                          |
| `TRUST_PROXY_HOPS`    | `0`                          | comme pour l'API ; sert au compteur anti-brute-force par IP                                                        |
| `CORS_ORIGINS`        | vide                         | origines du front autorisées (CORS et protection CSRF)                                                             |
| `SHUTDOWN_DRAIN_MS`   | `0`                          | comme pour l'API                                                                                                   |
| `SHUTDOWN_TIMEOUT_MS` | `25000`                      | comme pour l'API                                                                                                   |
| `DATABASE_URL`        | obligatoire                  | la même base que l'API ; tables dans le schéma `auth`                                                              |
| `DATABASE_POOL_MAX`   | `5`                          | connexions maximum par process                                                                                     |
| `SMTP_URL`            | absent                       | comme pour l'API : vérification d'email, réinitialisation du mot de passe, invitations. Obligatoire en production  |
| `MAIL_FROM`           | `Shop <no-reply@shop.local>` | expéditeur des emails                                                                                              |
| `AUTH_JWT_ISSUER`     | obligatoire                  | `iss` des access tokens émis ; même valeur que l'API                                                               |
| `AUTH_JWT_AUDIENCE`   | obligatoire                  | `aud` des access tokens émis ; même valeur que l'API                                                               |

## Observabilité

Lues par l'API, le worker et le service d'identité, avant tout autre module (`instrumentation.ts`). Hors schéma : une valeur absente désactive la fonction, sans erreur.

| Variable                      | Défaut                             | Rôle                                                                                                           |
| ----------------------------- | ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | absent                             | URL OTLP/HTTP du collecteur ; absent, OpenTelemetry est inactif                                                |
| `OTEL_SERVICE_NAME`           | `api` dans `apps/api/.env.example` | nom du service dans les traces : `api` pour l'API, `api-worker` pour le worker                                 |
| `AUTH_OTEL_SERVICE_NAME`      | `auth`                             | nom du service d'identité ; distinct d'`OTEL_SERVICE_NAME`, qu'un environnement commun avec l'API peut définir |
| `OTEL_SDK_DISABLED`           | absent                             | `true` coupe OpenTelemetry même avec un endpoint                                                               |
| `OTEL_METRIC_EXPORT_INTERVAL` | `60000`                            | intervalle d'export des métriques, en ms                                                                       |
| `SENTRY_DSN`                  | absent                             | projet Sentry ; absent, Sentry est inactif                                                                     |
| `SENTRY_ENVIRONMENT`          | absent                             | environnement affiché dans Sentry (`production`, `staging`…)                                                   |
| `SENTRY_RELEASE`              | absent                             | version déployée, ex. le SHA du commit                                                                         |

Les autres variables standard d'OpenTelemetry (`OTEL_TRACES_SAMPLER`, `OTEL_TRACES_SAMPLER_ARG`, `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_EXPORTER_OTLP_HEADERS`…) sont lues par le SDK sans rien changer au code.

## Front

Lues par Vite au build (`pnpm nx build web`) et figées dans les fichiers produits : un environnement, un build. En dev, dans `apps/web/.env` seulement (pas le `.env` de la racine).

| Variable         | Défaut                         | Rôle                                                                                                            |
| ---------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `VITE_API_URL`   | `http://localhost:3000/api/v1` | URL de l'API, préfixe de version compris                                                                        |
| `VITE_AUTH_URL`  | `http://localhost:3100`        | URL publique du service d'identité                                                                              |
| `VITE_DEV_TOKEN` | absent                         | dev seulement (`nx serve web`) : token envoyé à l'API sans connexion (`pnpm -s dev:token`). Ignoré par le build |

## Développement local

Lues dans le `.env` de la racine par `docker-compose.yml` et `pnpm dev:setup`, pas par les applications.

| Variable                | Défaut | Rôle                                                         |
| ----------------------- | ------ | ------------------------------------------------------------ |
| `POSTGRES_PORT`         | `5432` | port publié de Postgres ; doit concorder avec `DATABASE_URL` |
| `REDIS_PORT`            | `6379` | port publié de Redis ; doit concorder avec `REDIS_URL`       |
| `MAILPIT_SMTP_PORT`     | `1025` | port SMTP de Mailpit ; doit concorder avec `SMTP_URL`        |
| `MAILPIT_UI_PORT`       | `8025` | interface web de Mailpit                                     |
| `OTLP_PORT`             | `4318` | collecteur OTLP du profil `observability`                    |
| `OBSERVABILITY_UI_PORT` | `3001` | Grafana du profil `observability`                            |

`pnpm dev:setup` refuse un port qui ne concorde pas avec son URL et nomme la variable en conflit.

`docker-compose.prod.yml` lit en plus `API_PORT` et `AUTH_PORT` (ports publiés) et des valeurs pour ses services (`BETTER_AUTH_SECRET` obligatoire, `BETTER_AUTH_URL`, `AUTH_APP_URL`, `CORS_ORIGINS`…), avec des valeurs par défaut adaptées à un essai local. Comme toute commande docker compose, il ne lit que le `.env` de la racine, pas ceux des apps : `BETTER_AUTH_SECRET` se passe sur la ligne de commande.

Les parcours navigateur (`apps/web-e2e`) démarrent leur propre stack avec un environnement fixé dans `src/stack.ts`, sans lire les `.env` ; seuls leurs ports se changent (`E2E_API_PORT`, `E2E_AUTH_PORT`, `E2E_WEB_PORT`).
