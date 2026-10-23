# 0007. Une image, trois commandes ; migrations en étape de déploiement

- **Statut** : Acceptée
- **Date** : 2026-10-21

## Contexte

L'API sert du HTTP, relaie l'outbox, exécute des jobs et a des migrations à appliquer. Ces rôles n'ont pas les mêmes besoins de mise à l'échelle, et des migrations lancées au démarrage de chaque instance se concurrencent et font boucler les redémarrages en cas d'échec.

## Décision

- Une seule image Docker pour l'API, trois commandes : `main.js` (HTTP, `JOBS_ENABLED=false` en production), `worker.js` (relais, worker BullMQ, purge quotidienne ; sans port HTTP) et `migrate.js`.
- Les migrations sont une étape de déploiement à part, avant les nouvelles instances, sous un verrou consultatif Postgres. Elles restent rétrocompatibles (expand/contract), car les anciennes instances tournent pendant le déploiement.
- Arrêt propre sur SIGTERM : `/ready` en 503, attente du load balancer (`SHUTDOWN_DRAIN_MS`), fin des requêtes et des jobs en cours, sortie en erreur au-delà de `SHUTDOWN_TIMEOUT_MS`.
- Le service d'identité suit le même modèle avec sa propre image (`--build-arg APP=auth`) : `main.js` et `migrate.js`.

Détail : [Déployer](../../guides/deployer.md).

## Conséquences

- Un seul artefact à construire et à promouvoir pour l'API ; HTTP et worker se mettent à l'échelle séparément.
- Un changement de schéma cassant se fait en plusieurs déploiements.
- En dev, `nx serve api` réunit tout dans un process, plus simple mais différent de la production.
