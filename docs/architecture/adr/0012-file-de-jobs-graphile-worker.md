# 0012. File de jobs dans Postgres avec Graphile Worker

- **Statut** : Acceptée
- **Date** : 2026-11-16
- **Remplace** : [0005](0005-outbox-et-bullmq.md), pour le transport ; l'outbox transactionnelle reste

## Contexte

L'ADR 0005 fait passer chaque événement par trois étapes : une ligne dans `messaging.outbox`, un relais qui sonde cette table, puis un job BullMQ dans Redis. Ce montage coûte :

- **Une infrastructure critique de plus** : Redis doit tourner en `noeviction` avec persistance (AOF), sinon BullMQ perd des jobs. Ses données ne sont pas sauvegardées avec la base.
- **De la latence** : jusqu'à une seconde de sondage (`OUTBOX_POLL_INTERVAL_MS`) entre l'écriture et le traitement.
- **Du code** : le relais, ses jauges et sa reprise après crash n'existent que pour copier une table dans une file.

Le choix de BullMQ n'avait pas été argumenté (ADR 0005, « Alternatives écartées »). Redis faisait déjà partie de l'infrastructure locale.

## Décision

- Les jobs vivent dans Postgres, dans le schéma `graphile_worker`, gérés par [Graphile Worker](https://worker.graphile.org/).
- `Outbox.publish` garde sa signature et son refus hors transaction. Dans la transaction métier, il écrit la ligne de `messaging.outbox` (désormais un journal, marquée publiée tout de suite), puis appelle `graphile_worker.add_job` pour chaque handler abonné. L'événement, ses jobs et l'écriture métier sont validés ou annulés ensemble : le relais disparaît.
- Une seule tâche Graphile, `integration-event`, exécute un handler. Le reste ne change pas : contexte du tenant et de l'auteur, span enfant de la requête, transaction et marque d'idempotence, mode `transactional: false`. La clé du job (`job_key`) vaut `<event.id>:<handler>` : un même couple n'est mis en file qu'une fois.
- Le worker est réveillé par `LISTEN/NOTIFY` et prend les jobs avec `SKIP LOCKED`. Il a son propre pool Postgres, distinct de celui des requêtes.
- La purge quotidienne devient une ligne de la crontab de Graphile (`messaging:cleanup`, 3 h). Elle supprime aussi les jobs en échec définitif de plus de 7 jours.
- Les migrations de Graphile s'appliquent dans `migrate.js`, sous le même verrou que celles de Drizzle. Au démarrage, Graphile vérifie son schéma (un `select` quand il est à jour) et ne le migrerait que si cette étape avait été sautée.
- **Transition** : pendant un déploiement, les anciennes instances écrivent encore des lignes non publiées. Une tâche `messaging:relay-pending` les met en file chaque minute. Elle sert aussi de filet si une ligne reste non publiée. On pourra la retirer une fois tous les projets migrés.
- Redis ne sert plus qu'au rate limiting, qui laisse passer quand Redis est en panne. `/ready` ne vérifie plus Redis.

## Conséquences

- **Mêmes garanties** : pas d'événement sans effet ni d'effet sans événement, livraison au moins une fois, effet en base une seule fois, aucun ordre garanti entre handlers.
- **Latence** : quelques millisecondes entre la validation de la transaction et le début du traitement, au lieu d'une seconde au plus.
- **Infrastructure** : Redis n'a plus de données à perdre. `noeviction` et AOF ne sont plus nécessaires, et les jobs sont sauvegardés avec la base.
- **Retries** : 10 tentatives, avec le backoff fixé par Graphile (e^n secondes, environ 3 h 30 cumulées avant l'abandon, contre 8 min 30 avec BullMQ). Un payload invalide est abandonné tout de suite. Graphile n'a pas d'erreur « définitive » : le job est donc terminé, compté dans `integration_events.jobs.exhausted`, journalisé et envoyé à Sentry. L'événement reste dans `messaging.outbox` pendant 7 jours.
- **Handler inconnu** : réessayé, plus abandonné tout de suite. C'est désormais l'API qui met les jobs en file : pendant un déploiement, un ancien worker peut recevoir le job d'un handler qu'il n'a pas encore. Un handler renommé ou retiré voit donc ses jobs restants s'épuiser en 3 h 30.
- **Métriques** : `outbox.pending_events` et `outbox.oldest_pending_age` disparaissent, faute de relais. `integration_events.queue.oldest_waiting_age` mesure le retard (âge du plus ancien job prêt et non pris). `integration_events.queue.jobs` garde ses états (`waiting`, `active`, `delayed`, `failed`), lus dans `graphile_worker.jobs`.
- **Charge sur Postgres** : insertions et suppressions dans la table des jobs, donc autovacuum à surveiller. C'est largement suffisant pour un SaaS B2B. Un débit soutenu de plusieurs milliers de jobs par seconde justifierait un broker dédié.
- **Connexion directe** : `LISTEN` ne passe pas par un pooler en mode transaction (PgBouncer, poolers managés). Derrière un pooler, le worker doit avoir une URL qui le contourne.
- **Montée de version de Graphile** : certaines de ses migrations sont incompatibles avec les workers plus anciens (« breaking » dans son changelog) ; un worker refuse alors de démarrer sur une base plus récente que lui. Une mise à jour de `graphile-worker` (Renovate) se lit donc avant d'être fusionnée, et une version breaking demande d'arrêter les anciens workers avant de migrer.
- **Droits Postgres** : le rôle de l'API exécute `graphile_worker.add_job` dans ses transactions ; celui du worker lit et écrit dans le schéma `graphile_worker`.
- **Déploiement** depuis BullMQ : appliquer les migrations, déployer, puis arrêter les anciens workers une fois leur file BullMQ vide. Les lignes non publiées restantes sont reprises par `messaging:relay-pending`.

## Alternatives écartées

- **Garder BullMQ** : n'a de sens que si Redis reste de toute façon critique, ou pour un très gros débit.
- **pg-boss** : mêmes garanties dans Postgres, avec des options de singleton et de throttling plus riches. Il réveille le worker par sondage plutôt que par `LISTEN/NOTIFY`, donc avec plus de latence.
- **Garder le relais et remplacer seulement BullMQ** : moins de changements, mais on garde le sondage et sa latence sans rien y gagner.
