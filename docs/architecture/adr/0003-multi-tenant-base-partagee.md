# 0003. Multi-tenant en base partagée, filtré par `tenant_id` dans les repositories

- **Statut** : Acceptée
- **Date** : 2026-10-20

## Contexte

Chaque produit construit sur le boilerplate sert plusieurs organisations clientes (tenants), qui ne doivent jamais voir les données les unes des autres. Les organisations se créent en libre-service : un tenant doit coûter zéro à créer.

## Décision

- Toutes les tables métier sont partagées et portent une colonne `tenant_id uuid not null` ; chaque index commence par elle.
- Le tenant vient du token, placé dans `RequestContext` (AsyncLocalStorage) ; jamais d'un paramètre de la requête.
- Chaque repository filtre chaque lecture et chaque écriture sur le tenant du contexte, et écrit ce tenant à l'insertion. Les ports ne prennent pas de tenant en paramètre.
- Des tests d'intégration par repository vérifient qu'une ligne d'un autre tenant n'est ni lue ni modifiée.

Détail : [Multi-tenant et autorisations](../multi-tenant-et-autorisations.md).

## Conséquences

- Créer un tenant ne provisionne rien ; une migration s'applique à tous en une fois ; l'infrastructure transverse (outbox, purge, métriques) parcourt une table.
- L'isolation repose sur le code : un repository qui oublie le filtre fuit. C'est le principe 1 d'`AGENTS.md`, vérifié en revue et par les tests.
- Un tenant très volumineux partage index et ressources avec les autres.

## Alternatives écartées

Non écrites au moment de la décision ; les raisons ci-dessus sont reconstituées.

- **Un schéma ou une base par tenant** : isolation plus forte, mais provisionnement à la création, migrations à répéter par tenant, connexions à multiplier.
- **Row Level Security de Postgres** : non utilisée. Elle pourrait s'ajouter comme seconde barrière (une politique sur `tenant_id` et le tenant posé dans la session Postgres de chaque transaction) sans changer ce modèle.
