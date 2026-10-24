# Observabilité en local

Voir en local ce que la production enverra à vos outils : les traces d'une requête jusqu'aux handlers d'événements, les logs de chaque span et les métriques. Les règles sont résumées dans [`AGENTS.md`](../../AGENTS.md#observabilité) ; le détail des métriques et les alertes conseillées, dans [Référence : métriques et alertes](../reference/metriques-et-alertes.md).

## Ce qui est envoyé, et où

| Signal    | Source                                                                            | En local                                    |
| --------- | --------------------------------------------------------------------------------- | ------------------------------------------- |
| Traces    | OpenTelemetry : HTTP, Express, Nest, Postgres, handlers d'événements, Better Auth | Tempo                                       |
| Métriques | OpenTelemetry : durée des requêtes HTTP, outbox, file de jobs, handlers           | Prometheus                                  |
| Logs      | pino, chaque ligne avec `trace_id` et `span_id` ; envoyés aussi en OTLP           | Loki, et la sortie standard                 |
| Erreurs   | Sentry, erreurs inattendues seulement                                             | un projet Sentry de dev, si vous en avez un |

Tout est désactivé par défaut : sans `OTEL_EXPORTER_OTLP_ENDPOINT` ni `SENTRY_DSN`, rien n'est collecté et rien ne coûte, ni en dev ni en test.

## Lancer

1. Démarrer le collecteur et Grafana (image `grafana/otel-lgtm`, ~2,5 Go au premier téléchargement) :

   ```sh
   docker compose --profile observability up -d
   ```

2. Dans `.env` :

   ```sh
   OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
   # Optionnel : métriques toutes les 5 s au lieu de 60 s.
   OTEL_METRIC_EXPORT_INTERVAL=5000
   ```

3. Relancer l'API (`pnpm nx serve api`) et, si vous l'utilisez, le service d'identité (`pnpm nx serve auth`). Les instrumentations sont chargées au démarrage du process (`instrumentation.ts`) : un process déjà lancé n'envoie rien.

4. Faire quelques requêtes : `pnpm dev:seed`, l'interface, ou la doc de l'API (`/api/docs`). Pour voir des événements, déclencher une action qui en publie ; avec le code d'exemple, passer une commande, qui déclenche les handlers du catalogue et des notifications. Les exemples de cette page viennent de ce code.

5. Ouvrir Grafana : http://localhost:3001 (`OBSERVABILITY_UI_PORT`), sans identifiant.

## Suivre une requête

**Explore → Tempo**, onglet **Search** ou en TraceQL :

```
{ span.http.route = "/api/v1/orders" && span.http.request.method = "POST" }
```

Une trace contient, dans l'ordre :

- le span HTTP (`POST /api/v1/orders`), les middlewares Express et le controller (`OrdersController.place`) ;
- les requêtes SQL de la transaction (`pg.query:BEGIN`, `INSERT`…, `COMMIT`), dont l'écriture dans l'outbox ;
- un span `process <handler>` par handler qui a réagi à l'événement (`process catalog.record-sales`, `process notifications.order-confirmation-email`), avec ses propres requêtes SQL.

Les handlers s'exécutent plus tard, dans le worker, mais restent dans la même trace : l'outbox stocke le contexte de la requête et le worker le reprend. Leurs spans portent `app.event.type`, `app.event.handler`, `app.tenant.id` et `messaging.message.id` (l'ID de l'événement).

En local, `nx serve api` fait tout dans un seul process : tous les spans sont dans le service `api`. En production, ceux des handlers sont dans le service `api-worker` (`OTEL_SERVICE_NAME`), et ceux de Better Auth dans `auth`.

Ne sont pas tracés : `/health` et `/ready`, et les requêtes SQL hors span (le relais qui sonde l'outbox chaque seconde ne crée pas une trace par sondage).

## Lire les logs d'une requête

Depuis un span dans Tempo, **Logs for this span** ouvre les lignes de Loki qui portent son `trace_id`. Ou directement, **Explore → Loki** :

```
{service_name="api"} | trace_id = "e520398bbc6930943b99a2c5b4868e66"
```

Dans le terminal, chaque ligne émise pendant un span porte aussi `trace_id` et `span_id`. Chaque requête a de plus un `x-request-id`, renvoyé dans la réponse et présent dans le log `request completed` : on part de l'ID donné par un client pour retrouver la trace.

## Lire les métriques

**Explore → Prometheus**. Les noms OpenTelemetry y sont traduits : points en soulignés, unité en suffixe, `_total` pour un compteur. Quelques requêtes :

```promql
# Retard du relais de l'outbox, en secondes
outbox_oldest_pending_age_seconds

# Requêtes par route et code de réponse, sur 5 min
sum by (http_route, http_response_status_code) (rate(http_server_request_duration_seconds_count[5m]))

# Durée p95 d'un handler
histogram_quantile(0.95, sum by (le, app_event_handler) (rate(integration_events_handler_duration_seconds_bucket[5m])))
```

La liste complète, les attributs et les alertes : [Référence : métriques et alertes](../reference/metriques-et-alertes.md).

## Ajouter un span

Le code métier n'a rien à faire pour être tracé. Pour isoler une opération coûteuse dans sa trace, un span sur mesure, avec `@opentelemetry/api` seulement (jamais le SDK) :

```ts
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('billing');

return tracer.startActiveSpan('billing.compute-invoice', async (span) => {
  try {
    span.setAttribute('app.invoice.lines', lines.length);
    return await this.compute(lines);
  } finally {
    span.end();
  }
});
```

Sans SDK démarré (tests, dev sans endpoint), `@opentelemetry/api` renvoie des spans inertes : le code n'a pas à tester si la télémétrie est active. Pas de donnée personnelle dans les attributs : un ID, pas un email.

## Sentry en local

Facultatif. Avec `SENTRY_DSN` d'un projet de dev dans `.env` (et `SENTRY_ENVIRONMENT=development`), sont envoyées :

- les 5xx inattendues, avec la route, le `request_id`, le tenant et l'ID de l'utilisateur ;
- les jobs abandonnés (retries épuisés ou payload invalide), avec le handler et l'ID de l'événement ; un échec suivi d'un retry réussi n'est pas envoyé ;
- les exceptions non rattrapées.

Chaque erreur porte le tag `trace_id` : on le colle dans Tempo pour retrouver la trace et les logs. Pour signaler une erreur rattrapée ailleurs : `reportError(error, { tags })` d'api-core.

## Dans les tests

`startTestTelemetry()` (`@nx-react-nestjs/api-core/testing`) enregistre un vrai SDK qui garde spans et métriques en mémoire : un test peut vérifier qu'un span a été créé ou qu'une métrique a bougé, sans collecteur.

## Ça n'apparaît pas

- **Aucune trace** : `OTEL_EXPORTER_OTLP_ENDPOINT` est-il dans le `.env` lu par le process, et le process a-t-il été relancé ? `OTEL_SDK_DISABLED=true` coupe tout.
- **Pas de métriques** : elles partent toutes les 60 s par défaut ; baisser `OTEL_METRIC_EXPORT_INTERVAL`. Les métriques de l'outbox et de la file ne sont émises que par un process qui a `JOBS_ENABLED=true`.
- **Pas de span `process …`** : aucun événement n'a été publié, ou le worker ne tourne pas (`JOBS_ENABLED=false` sans `worker.js` lancé).
- **Port 4318 ou 3001 déjà pris** : changer `OTLP_PORT` (et l'endpoint) ou `OBSERVABILITY_UI_PORT` dans `.env`.

Pour arrêter : `docker compose --profile observability stop observability`. Les traces, logs et métriques n'ont pas de volume : ils disparaissent quand le conteneur est supprimé (`docker compose --profile observability down`).
