# 0009. Erreurs métier typées, converties en RFC 9457 en un seul endroit

- **Statut** : Acceptée
- **Date** : 2026-10-20

## Contexte

Le front et les autres clients doivent pouvoir réagir à une erreur précise (produit indisponible, conflit de version) sans analyser un message en texte libre, et les erreurs inattendues ne doivent pas exposer de détail interne. Si chaque controller choisit son statut HTTP, les réponses divergent et le métier se met à connaître HTTP.

## Décision

- Toute erreur métier est une sous-classe d'`AppError`, avec un code stable en union littérale (`ORDER_NOT_FOUND`…) et une nature (`NOT_FOUND`, `CONFLICT`, `INTERNAL`…). `throw new Error()` est interdit hors de `infra/` et du démarrage.
- La conversion en HTTP se fait uniquement dans `ProblemDetailsFilter`, au format RFC 9457 (`application/problem+json`, `type`, `title`, `status`, `code`, `detail`).
- Une 5xx inattendue répond sans détail, est journalisée et part chez Sentry avec la route, le `request_id` et le tenant.

## Conséquences

- Les codes d'erreur font partie du contrat de l'API : en renommer un est un changement cassant.
- Le domaine et les cas d'usage ignorent HTTP ; un même cas d'usage servirait un autre transport.
- Le front lit `code` sur `ApiError` (`web-data-access`) pour choisir son message.
