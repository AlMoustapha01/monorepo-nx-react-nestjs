# 0001. Une API en monolithe modulaire, un domaine par lib Nx

- **Statut** : Acceptée
- **Date** : 2026-10-20

## Contexte

Le boilerplate sert de point de départ à des produits SaaS dont le découpage métier n'est pas connu d'avance et changera. Il faut des frontières nettes entre domaines, pour que chacun reste compréhensible et testable seul, sans payer tout de suite le coût d'un système distribué : déploiements multiples, appels réseau entre services, cohérence éventuelle partout.

## Décision

Une seule API NestJS (`apps/api`), découpée en domaines, chacun dans sa lib Nx (`libs/api/<domaine>`) avec quatre couches (`domain`, `application`, `infra`, `http`).

- Un domaine n'expose que sa façade (`index.ts`) : module Nest, façade, types de contrat. Les alias TypeScript ne permettent pas d'importer autre chose.
- Un domaine en consomme un autre par un port dans `application/` et un adapter qui délègue à la façade ; il réagit à un autre par des événements ([0005](0005-outbox-et-bullmq.md)).
- Les tags Nx (`scope:*`, `type:*`) font respecter ces frontières au lint ; `core` ne dépend d'aucun domaine ; `domain/` n'importe ni Nest, ni Drizzle, ni `pg`.

## Conséquences

- Un seul déploiement, une seule base, des transactions locales : un cas d'usage écrit dans son domaine et publie un événement dans la même transaction.
- Les frontières sont vérifiées par l'outillage, pas seulement par la revue.
- Un domaine pourra devenir un service à part : il n'est lié aux autres que par des façades et des contrats d'événements, et possède ses tables ([0002](0002-schema-postgres-par-domaine.md)). Il faudra alors remplacer l'adapter de façade par un client réseau.
- Tous les domaines montent et tombent ensemble, et partagent les ressources du process.

## Alternatives écartées

Non écrites au moment de la décision. Les microservices dès le départ sont l'alternative évidente ; leur coût (réseau, déploiements, cohérence éventuelle) est ce que cette décision évite.
