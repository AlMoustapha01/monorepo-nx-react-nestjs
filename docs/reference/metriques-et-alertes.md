# Référence : métriques et alertes

Les métriques émises par l'API et le worker, et les alertes à poser en production. Pour les voir en local : [Observabilité en local](../guides/observabilite-en-local.md).

Toutes passent par OpenTelemetry (OTLP/HTTP, toutes les 60 s ; `OTEL_METRIC_EXPORT_INTERVAL`). Le nom de la colonne **Prometheus** est celui qu'on obtient avec un backend qui traduit les noms OTLP à la façon de Prometheus (celui de `grafana/otel-lgtm`, Grafana Cloud, Mimir) : points en soulignés, unité en suffixe, `_total` pour un compteur. D'autres backends (Datadog, Honeycomb…) gardent le nom OpenTelemetry.

## Métriques

### HTTP

Émise par l'instrumentation HTTP d'OpenTelemetry, dans l'API et le service d'identité.

| OpenTelemetry                  | Prometheus                             | Type                  | Attributs                                                                                         |
| ------------------------------ | -------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------- |
| `http.server.request.duration` | `http_server_request_duration_seconds` | histogramme, secondes | `http.route` (gabarit : `/api/v1/orders/:id`), `http.request.method`, `http.response.status_code` |

Une requête qui ne correspond à aucune route (404 de Nest) n'a pas de `http.route`. `/health` et `/ready` ne sont pas comptées.

### Messagerie (outbox et événements)

Émises par api-core, seulement par un process qui a `JOBS_ENABLED=true` : le worker en production, l'unique process en dev.

| OpenTelemetry                         | Prometheus                                    | Type                  | Attributs                                             | Sens                                                                                       |
| ------------------------------------- | --------------------------------------------- | --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `outbox.pending_events`               | `outbox_pending_events`                       | jauge                 | aucun                                                 | événements écrits mais pas encore relayés vers BullMQ                                      |
| `outbox.oldest_pending_age`           | `outbox_oldest_pending_age_seconds`           | jauge, secondes       | aucun                                                 | âge du plus ancien événement non relayé : le retard du relais ; 0 si l'outbox est vide     |
| `integration_events.queue.jobs`       | `integration_events_queue_jobs`               | jauge                 | `state` : `waiting`, `active`, `delayed`, `failed`    | jobs dans la file BullMQ, par état                                                         |
| `integration_events.handler.duration` | `integration_events_handler_duration_seconds` | histogramme, secondes | `app.event.handler`, `outcome` : `success` ou `error` | durée d'exécution d'un handler, retries compris un par un                                  |
| `integration_events.jobs.exhausted`   | `integration_events_jobs_exhausted_total`     | compteur              | `app.event.handler`                                   | jobs abandonnés : retries épuisés ou erreur définitive (payload invalide, handler inconnu) |

À savoir pour les lire :

- **Plusieurs workers** : les jauges `outbox.*` et `integration_events.queue.jobs` lisent un état partagé (la table outbox, la file Redis). Chaque instance rapporte la même valeur : agréger avec `max`, pas `sum`.
- `state="delayed"` vaut au moins 1 : le job planifié de la purge quotidienne y attend son heure.
- `state="failed"` compte les jobs abandonnés encore gardés dans Redis (7 jours). Pour détecter un abandon, suivre le compteur `jobs_exhausted`, pas cette jauge.
- Un handler en échec puis réussi au retry produit une mesure `outcome="error"` puis une `outcome="success"`, et aucun abandon.

Dans Prometheus, les attributs deviennent des labels en soulignés (`app_event_handler`, `http_route`) ; le service est dans `job` et `service_name` (`api`, `api-worker`, `auth`).

## Alertes conseillées

Les requêtes sont en PromQL, avec les noms de la colonne Prometheus. Seuils de départ, à ajuster à votre trafic.

| Alerte                       | Condition                                                                                                                                                        | Pendant  | Pourquoi                                                                                                   |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| Relais de l'outbox en retard | `max(outbox_oldest_pending_age_seconds) > 60`                                                                                                                    | 5 min    | le relais ne tourne plus (worker arrêté, Redis injoignable) : les réactions aux événements n'ont plus lieu |
| Job abandonné                | `sum by (app_event_handler) (increase(integration_events_jobs_exhausted_total[15m])) > 0`                                                                        | immédiat | un effet n'a pas eu lieu (email non envoyé, projection non mise à jour) : à traiter à la main              |
| File qui grossit             | `max(integration_events_queue_jobs{state="waiting"}) > 1000`                                                                                                     | 10 min   | les workers ne suivent pas : en ajouter, ou chercher un handler lent                                       |
| Handler en échec répété      | `sum by (app_event_handler) (rate(integration_events_handler_duration_seconds_count{outcome="error"}[10m])) > 0.1`                                               | 10 min   | un service externe en panne, ou un bug : les retries finiront en abandon                                   |
| Taux de 5xx                  | `sum(rate(http_server_request_duration_seconds_count{http_response_status_code=~"5.."}[5m])) / sum(rate(http_server_request_duration_seconds_count[5m])) > 0.01` | 5 min    | plus de 1 % des requêtes en erreur serveur ; le détail est dans Sentry                                     |
| Latence                      | `histogram_quantile(0.95, sum by (le, http_route) (rate(http_server_request_duration_seconds_bucket[5m]))) > 1`                                                  | 10 min   | p95 au-dessus d'une seconde sur une route                                                                  |

Une alerte qui ne repose pas sur une métrique : **aucun worker en vie**. Sans worker, les jauges de messagerie ne sont plus émises du tout et les alertes ci-dessus restent muettes. Selon votre backend : `absent(outbox_oldest_pending_age_seconds)` pendant 5 min, ou une alerte de l'orchestrateur sur le nombre d'instances du worker.

## Erreurs (Sentry)

Hors métriques, avec `SENTRY_DSN` : chaque erreur porte le tag `trace_id`, pour passer de Sentry à la trace et aux logs.

| Source                | Quand                                                                                            | Tags                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| API, 5xx              | erreur inattendue (pas une `HttpException` 5xx levée exprès, comme le 503 de `/ready` à l'arrêt) | `route`, `request_id`, `tenant_id`, utilisateur (ID seulement)          |
| Worker, job abandonné | retries épuisés ou erreur définitive ; pas un échec suivi d'un retry réussi                      | `handler`, `event_id`, `tenant_id`, utilisateur (auteur de l'événement) |
| API, worker, identité | exception non rattrapée, promesse rejetée sans `catch`                                           | aucun                                                                   |
| Service d'identité    | erreur inattendue (pas les refus 4xx), email impossible à envoyer                                | `service: auth`                                                         |

Pas d'email ni d'autre donnée personnelle chez Sentry : l'ID de l'utilisateur seulement.
