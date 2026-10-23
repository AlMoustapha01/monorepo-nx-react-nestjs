# 0004. Identifiants métier préfixés et triables par date

- **Statut** : Acceptée
- **Date** : 2026-10-20

## Contexte

Les premiers domaines utilisaient des UUID v4. Un UUID ne dit pas ce qu'il désigne (une commande ? un produit ?) quand il apparaît dans un log, une URL ou un ticket de support, et un UUID v4 aléatoire disperse les insertions dans l'index et ne se trie pas par date, alors que la pagination est triée par création.

## Décision

- Les identifiants métier ont la forme `<PRÉFIXE>-<suffixe>` (`PRD-…`, `ORD-…`, `EVT-…`), générés par `domainIdGenerator` (api-core) : 9 caractères d'horodatage à la milliseconde, puis 11 aléatoires.
- Le préfixe est déclaré une fois dans les contrats du domaine (`ORDER_ID_PREFIX`) et validé par `domainIdSchema`, partagé avec le front : une route rejette en 400 un ID du mauvais type avant toute requête en base.
- En base : `text COLLATE "C"`, pour un tri octet par octet indépendant de la locale.
- Les IDs de tenant et d'utilisateur restent des UUID : ils viennent du fournisseur d'identité.

## Conséquences

- Un ID se lit : on sait ce qu'il désigne et à peu près quand il a été créé.
- Les IDs se trient par création ; les insertions arrivent en fin d'index, comme avec un UUID v7 ou un ULID.
- L'horodatage est lisible dans l'ID : la date de création d'une ressource n'est pas un secret.
- Deux familles d'identifiants coexistent (préfixés et UUID), avec deux schémas de validation.
