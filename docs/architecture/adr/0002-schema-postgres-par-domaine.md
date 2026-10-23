# 0002. Un schéma Postgres par domaine, sans clé étrangère entre domaines

- **Statut** : Acceptée
- **Date** : 2026-10-20

## Contexte

Avec une seule base ([0001](0001-monolithe-modulaire.md)), rien n'empêche techniquement une requête de joindre les tables de deux domaines. Ce couplage par la base est invisible dans le code TypeScript et rend impossible de faire évoluer ou d'extraire un domaine seul.

## Décision

- Chaque domaine possède son schéma Postgres (`pgSchema('<domaine>')`) et ses tables.
- Pas de jointure ni de clé étrangère vers les tables d'un autre domaine : on passe par sa façade, ou on ne garde que son ID (`order_lines.product_id` n'a pas de clé étrangère vers `catalog.products`).
- Les données dont un domaine a besoin d'un autre au moment d'écrire sont copiées (le nom et le prix d'un produit dans la ligne de commande), et celles qui doivent suivre un autre domaine arrivent par événement.
- `api-core` a ses propres schémas (`messaging`, `idempotency`), le service d'identité le sien (`auth`).

## Conséquences

- Les dépendances entre domaines sont toutes visibles dans le code (façades, contrats d'événements).
- Pas d'intégrité référentielle entre domaines : un ID peut pointer vers une ressource supprimée ou archivée, et le code doit le gérer.
- Une lecture qui croise deux domaines coûte un appel de façade, pas une jointure.
