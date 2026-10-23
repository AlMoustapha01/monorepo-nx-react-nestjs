# 0005. Événements d'intégration par outbox transactionnelle et BullMQ

- **Statut** : Acceptée
- **Date** : 2026-10-20

## Contexte

Des domaines doivent réagir aux faits d'autres domaines (compter les ventes quand une commande est passée, envoyer un email de confirmation) sans en dépendre et sans ralentir la requête. Publier directement dans une file après l'écriture en base perd l'événement si le process tombe entre les deux, ou publie un événement dont l'écriture a été annulée.

## Décision

- Un événement est déclaré dans les contrats (`defineIntegrationEvent('<domaine>.<fait>.v1', schéma zod)`) ; une version publiée ne change plus.
- Il est écrit dans une table `messaging.outbox`, dans la même transaction que l'écriture métier. L'outbox refuse de publier hors transaction.
- Un relais lit l'outbox (`SKIP LOCKED`) et pousse dans BullMQ (Redis) un job par couple (événement, handler), pour que chaque handler réessaie indépendamment.
- Le worker exécute le handler au nom du tenant et de l'auteur de l'événement, avec une marque d'idempotence dans la même transaction que son effet. Livraison au moins une fois, effet en base une seule fois.

Détail : [Outbox et événements](../outbox-et-evenements.md).

## Conséquences

- Pas d'événement sans effet, ni d'effet sans événement. Une panne de Redis retarde les événements sans en perdre.
- Les handlers doivent être idempotents (assuré en base, à la charge du handler pour un appel externe) et supporter un ordre quelconque : aucun ordre n'est garanti.
- Une dépendance à Redis, à configurer sans éviction et avec persistance, et un process worker à exploiter.
- Une ligne écrite en plus par événement, et un délai (jusqu'à une seconde de sondage) entre l'écriture et le traitement.

## Alternatives écartées

Non écrites au moment de la décision. Le choix de BullMQ plutôt qu'un autre broker (RabbitMQ, Kafka, SQS) n'est pas argumenté dans l'historique ; Redis faisait déjà partie de l'infrastructure locale.
