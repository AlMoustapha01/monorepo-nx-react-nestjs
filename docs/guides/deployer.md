# Déployer

Ce guide décrit ce qu'il faut faire tourner en production, dans quel ordre, et les réglages sans lesquels ça marche en apparence mais casse sous charge ou au premier redéploiement. Les règles sont résumées dans [`AGENTS.md`](../../AGENTS.md#déploiement) ; la cible (Kubernetes, ECS, Fly, Compose sur une VM…) est à votre choix.

## Ce qui tourne

Deux images, construites par le même `Dockerfile` :

| Image                                            | Commande          | Rôle                                                 | Instances                 |
| ------------------------------------------------ | ----------------- | ---------------------------------------------------- | ------------------------- |
| API (`docker build .`)                           | `node main.js`    | API HTTP, port 3000                                  | selon le trafic           |
|                                                  | `node worker.js`  | relais de l'outbox, worker BullMQ, purge quotidienne | selon le volume de jobs   |
|                                                  | `node migrate.js` | migrations de l'API, puis sortie                     | une, à chaque déploiement |
| Identité (`docker build --build-arg APP=auth .`) | `node main.js`    | Better Auth, port 3100                               | selon le trafic           |
|                                                  | `node migrate.js` | tables de Better Auth (schéma `auth`), puis sortie   | une, à chaque déploiement |

Plus le front (fichiers statiques), Postgres et Redis. L'API et le service d'identité partagent la même base Postgres, chacun dans ses schémas.

```
navigateur ──► front (statique)
    │ cookie de session          ┌────────────► auth :3100 ──► Postgres (schéma auth)
    ├────────────────────────────┘                 ▲
    │ Bearer (token 15 min)                        │ JWKS (réseau interne)
    └──────────────────────────────► api :3000 ────┘──► Postgres, Redis
                                     worker ─────────► Postgres, Redis, SMTP
```

## Vérifier la topologie en local

`docker-compose.prod.yml` reproduit cette topologie avec les images de production. Ce n'est pas un déploiement, mais le moyen de vérifier qu'une image démarre, que les migrations passent et que les services se trouvent :

```sh
BETTER_AUTH_SECRET=$(openssl rand -hex 32) docker compose -f docker-compose.prod.yml up --build
```

Le fichier sert aussi de modèle : variables de chaque service, ordre de démarrage, sondes, `stop_grace_period`.

## Ordre d'un déploiement

1. **Construire** les deux images, une fois, depuis le commit déployé. La base Node est épinglée par digest dans le `Dockerfile`.
2. **Migrer** : lancer `node migrate.js` de chaque image (API et identité) comme une tâche qui se termine (Job Kubernetes, tâche ECS, `docker run --rm`). Le déploiement s'arrête si elle sort en erreur.
3. **Démarrer** les nouvelles instances (`auth`, `api`, `worker`), en remplacement progressif des anciennes.

Les migrations ne tournent jamais au démarrage de l'API : avec plusieurs instances, elles se feraient concurrence, et un échec ferait boucler les redémarrages. Chaque `migrate.js` prend un verrou consultatif Postgres : deux déploiements simultanés se sérialisent au lieu de s'écraser.

### Une migration doit supporter l'ancien code

Pendant l'étape 3, les anciennes instances tournent encore, sur le schéma déjà migré. Toute migration doit donc être compatible avec le code précédent (principe 5). Un changement cassant se fait en plusieurs déploiements (expand/contract). Exemple, renommer `products.title` en `products.name` :

| Déploiement  | Migration                                   | Code                                                                                                        |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 1. expand    | ajoute `name`, nullable                     | écrit `title` et `name`, lit `title`                                                                        |
| (entre-deux) | aucune                                      | un script recopie `title` dans `name` pour les lignes existantes, une fois le déploiement 1 terminé partout |
| 2. bascule   | `name` devient `NOT NULL`, `title` nullable | lit et écrit `name` seulement ; `title` reste dans `*.schema.ts`                                            |
| 3.           | aucune                                      | retire `title` de `*.schema.ts`, **sans** lancer `db-generate`                                              |
| 4. contract  | `db-generate` : supprime `title`            | inchangé                                                                                                    |

Pourquoi l'étape 3 : les repositories lisent avec `.select()`, qui nomme chaque colonne du schéma Drizzle. Si la colonne disparaissait de la base dans le même déploiement que du schéma, les anciennes instances, qui la nomment encore, échoueraient jusqu'à la fin du déploiement. Entre les étapes 3 et 4, le schéma Drizzle et les migrations divergent volontairement : le prochain `db-generate`, quel qu'il soit, produira la suppression, donc l'étape 4 suit aussitôt.

Même logique pour une colonne obligatoire (ajoutée avec une valeur par défaut, ou nullable puis remplie), une table renommée ou un type changé. Supprimer une colonne encore lue par le code en production est l'erreur classique.

Les migrations restent générées (`pnpm nx run api:db-generate --name=<sujet>`) et relues. Celles de Better Auth sont additives par construction : `migrate.js` du service d'identité ne fait qu'ajouter tables, colonnes et index.

## Configuration

Chaque process valide son environnement au démarrage et refuse de démarrer si une variable manque ou est invalide, en la nommant. Schémas : `libs/api/core/src/lib/config/env.ts` (API, worker) et `apps/auth/src/env.ts` (identité). `.env.example` les commente toutes.

### API et worker

| Variable                                   | En production                                                                                |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                 | `production` (posé par l'image)                                                              |
| `DATABASE_URL`, `REDIS_URL`                | obligatoires                                                                                 |
| `AUTH_JWKS_URL`                            | obligatoire : `http://<service auth>/api/auth/jwks`, par le réseau interne                   |
| `AUTH_JWT_SECRET`                          | **interdit** : le process refuse de démarrer                                                 |
| `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`     | mêmes valeurs que le service d'identité                                                      |
| `SMTP_URL`                                 | obligatoire (le worker envoie les emails)                                                    |
| `MAIL_FROM`                                | l'expéditeur de votre domaine                                                                |
| `CORS_ORIGINS`                             | l'URL du front, sans slash final                                                             |
| `JOBS_ENABLED`                             | `false` pour `main.js` ; `worker.js` le force à `true`                                       |
| `SHUTDOWN_DRAIN_MS`, `SHUTDOWN_TIMEOUT_MS` | voir [Arrêt](#arrêt-et-redémarrage)                                                          |
| `TRUST_PROXY_HOPS`                         | nombre de proxys devant l'API ; voir [Derrière un load balancer](#derrière-un-load-balancer) |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_TTL_MS`      | 100 requêtes par minute par défaut                                                           |
| `DATABASE_POOL_MAX`                        | 10 par process par défaut ; voir [Postgres](#postgres)                                       |
| `FEATURE_FLAGS`                            | surcharges, ex. `announcements=true` ; un nom inconnu bloque le démarrage                    |
| `OTEL_*`, `SENTRY_*`                       | optionnelles ; `OTEL_SERVICE_NAME=api` pour l'API, `api-worker` pour le worker               |

### Service d'identité

| Variable                                   | En production                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------- |
| `BETTER_AUTH_SECRET`                       | 32 caractères minimum, généré (`openssl rand -hex 32`), dans un gestionnaire de secrets |
| `BETTER_AUTH_URL`                          | URL publique du service, vue par le navigateur (liens des emails, cookies)              |
| `AUTH_APP_URL`                             | URL du front (liens d'invitation)                                                       |
| `CORS_ORIGINS`                             | l'URL du front : origines autorisées et protection CSRF                                 |
| `DATABASE_URL`                             | la même base que l'API                                                                  |
| `SMTP_URL`, `MAIL_FROM`                    | obligatoire, pour la vérification d'email et la réinitialisation du mot de passe        |
| `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`     | mêmes valeurs que l'API                                                                 |
| `TRUST_PROXY_HOPS`                         | comme pour l'API                                                                        |
| `SHUTDOWN_DRAIN_MS`, `SHUTDOWN_TIMEOUT_MS` | comme pour l'API                                                                        |

**Ne jamais changer `BETTER_AUTH_SECRET`** sans plan : il chiffre les clés privées du JWKS stockées en base. Un nouveau secret rend ces clés illisibles, et toutes les sessions deviennent invalides.

### Front

Le front est un build statique (`pnpm nx build web`, dans `dist/apps/web`), servi par n'importe quel serveur de fichiers ou CDN. Ses URL sont figées au build :

```sh
VITE_API_URL=https://api.example.com/api/v1 VITE_AUTH_URL=https://auth.example.com pnpm nx build web
```

Un environnement différent demande donc un build différent. Les routes étant gérées côté client, le serveur doit renvoyer `index.html` pour tout chemin inconnu.

Le cookie de session de Better Auth est en `SameSite=Lax` : le front et le service d'identité doivent être sur le même site, par exemple `app.example.com` et `auth.example.com`. Sur deux domaines différents, le navigateur n'enverrait pas le cookie et la connexion ne tiendrait pas.

## Sondes

| Process  | Liveness  | Readiness | `/ready` vérifie                                                               |
| -------- | --------- | --------- | ------------------------------------------------------------------------------ |
| API      | `/health` | `/ready`  | Postgres (et Redis si `JOBS_ENABLED=true`)                                     |
| Identité | `/health` | `/ready`  | Postgres                                                                       |
| Worker   | aucune    | aucune    | pas de port HTTP : un crash fait sortir le process, l'orchestrateur le relance |

Les sondes sont hors du préfixe `/api/v1`, publiques et non comptées par le rate limiting. `/ready` passe à 503 dès le signal d'arrêt.

L'API sans jobs ne vérifie pas Redis : une panne Redis ne doit pas retirer toutes les instances du load balancer, puisque le rate limiting la laisse passer.

## Arrêt et redémarrage

Sur SIGTERM, l'API et le service d'identité :

1. passe `/ready` en 503 ;
2. attend `SHUTDOWN_DRAIN_MS`, le temps que le load balancer voie la sonde et retire l'instance ;
3. termine les requêtes et les jobs en cours, ferme Redis (API seulement) et Postgres, vide la télémétrie, puis sort ;
4. sort en erreur si tout ça dépasse `SHUTDOWN_TIMEOUT_MS`.

Réglage :

- `SHUTDOWN_DRAIN_MS` : 5000 derrière Kubernetes ou un load balancer (assez pour un cycle de sonde) ; 0 en local.
- `SHUTDOWN_TIMEOUT_MS` (25 s) doit rester sous le délai avant SIGKILL de l'orchestrateur (`terminationGracePeriodSeconds`, `stop_grace_period` : 30 s par défaut), drain compris.

Le worker suit les mêmes étapes ; sans load balancer à attendre, laissez-lui `SHUTDOWN_DRAIN_MS=0`.

## Derrière un load balancer

`TRUST_PROXY_HOPS` dit combien de proxys de confiance précèdent le process (1 derrière un load balancer, 2 derrière un CDN puis un load balancer). L'IP du client est alors lue dans `X-Forwarded-For`.

Sans ce réglage, tous les clients ont l'IP du proxy :

- dans l'API, tous les anonymes partagent le même compteur de rate limiting ;
- dans le service d'identité, tous partagent le compteur anti-brute-force (3 connexions par 10 s) : un attaquant bloque la connexion de tout le monde.

Une valeur trop grande est l'erreur inverse : le client choisit son IP en forgeant `X-Forwarded-For`. Comptez exactement les proxys que vous contrôlez.

## Redis

Redis porte les jobs BullMQ et les compteurs de rate limiting. Il doit être configuré avec :

- `maxmemory-policy noeviction` : sous pression mémoire, une autre politique supprimerait des jobs ;
- la persistance AOF (`appendonly yes`) : un redémarrage ne doit pas vider la file.

Un Redis managé (ElastiCache, Memorystore, Upstash…) se règle souvent par défaut en `volatile-lru` ou sans persistance : à vérifier. Toutes les clés applicatives ont un TTL.

Quand Redis tombe : l'API continue de répondre (le rate limiting laisse passer, avec un avertissement par minute), les événements s'accumulent dans l'outbox Postgres, et le worker les relaie à son retour. Aucun événement n'est perdu.

## Postgres

- **Connexions** : chaque process ouvre jusqu'à `DATABASE_POOL_MAX` connexions (10 pour l'API et le worker, 5 pour l'identité). Le total, toutes instances comprises, doit rester sous `max_connections`, migrations comprises. Au-delà de quelques dizaines d'instances, placer un pooler (PgBouncer en mode transaction).
- **Droits** : `migrate.js` crée des schémas et des tables ; les process applicatifs n'ont besoin que de lire et écrire. Deux rôles Postgres distincts limitent les dégâts d'une injection.
- **Rétention** : le worker purge chaque jour l'outbox (7 jours) et les marques d'idempotence (30 jours). Les jobs restent dans Redis 24 h en cas de succès, 7 jours en cas d'échec.

## Avant la première mise en production

- [ ] `pnpm strip:examples` passé, ou le code d'exemple assumé ([Démarrer un projet](demarrer-un-projet.md)).
- [ ] `BETTER_AUTH_SECRET` généré et rangé dans un gestionnaire de secrets.
- [ ] `AUTH_JWKS_URL` pointe vers le service d'identité ; `AUTH_JWT_SECRET` absent.
- [ ] Issuer et audience identiques des deux côtés.
- [ ] SMTP réel configuré, domaine d'expédition vérifié (SPF, DKIM).
- [ ] Front, API et identité sur le même site ; `CORS_ORIGINS`, `BETTER_AUTH_URL` et `AUTH_APP_URL` en HTTPS.
- [ ] `TRUST_PROXY_HOPS` égal au nombre de proxys réels.
- [ ] Redis en `noeviction` avec AOF.
- [ ] Les migrations tournent comme étape bloquante avant les nouvelles instances.
- [ ] `SHUTDOWN_DRAIN_MS=5000`, et délai avant SIGKILL supérieur à `SHUTDOWN_TIMEOUT_MS`.
- [ ] Sondes branchées : `/health` en liveness, `/ready` en readiness, pour l'API et l'identité.
- [ ] Traces et erreurs : `OTEL_EXPORTER_OTLP_ENDPOINT` et `SENTRY_DSN`, et des alertes sur le retard de l'outbox et les jobs abandonnés (voir [`AGENTS.md`](../../AGENTS.md#observabilité)).
- [ ] Feature flags : seules les fonctionnalités prêtes sont activées par `FEATURE_FLAGS`.
