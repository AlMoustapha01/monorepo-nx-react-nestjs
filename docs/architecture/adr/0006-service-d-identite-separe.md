# 0006. Identité dans un service à part, l'API vérifie des JWT

- **Statut** : Acceptée
- **Date** : 2026-10-21

## Contexte

Jusque-là, l'API vérifiait des JWT signés avec un secret HS256 partagé, que seuls les outils de dev savaient produire. Il fallait de vrais comptes, des organisations (tenants), des rôles, et un moyen de vérifier les tokens qui ne permette pas aussi d'en fabriquer.

## Décision

- Un service d'identité à part (`apps/auth`), construit avec Better Auth, déployé séparément, avec ses tables dans le schéma `auth`.
- Une organisation Better Auth est un tenant ; `owner` et `admin` donnent le rôle `staff`.
- Le service émet des access tokens JWT de 15 minutes (EdDSA) et publie ses clés publiques (JWKS). L'API les vérifie localement, algorithmes asymétriques seulement, `iss` et `aud` obligatoires.
- Le contrat entre les deux est minimal : `sub` et le tenant en UUID, des rôles, un email s'il est vérifié. Les noms des claims sont configurables.
- Le secret HS256 reste pour le dev et les tests, refusé en production.

Détail : [Authentification](../authentification.md).

## Conséquences

- L'API ne dépend d'aucune bibliothèque d'authentification : changer de fournisseur (Keycloak, Auth0, Cognito) ne demande que de la configuration, s'il fournit des UUID.
- L'API ne contacte pas le fournisseur à chaque requête, et continue de vérifier les tokens si celui-ci tombe (clés en cache).
- Un token reste valable jusqu'à 15 minutes après le retrait d'un membre : pas de révocation immédiate.
- Un service de plus à déployer, à migrer et à surveiller, et un secret (`BETTER_AUTH_SECRET`) qui ne doit jamais changer sans plan.
- Le front doit être sur le même site que le service d'identité (cookie `SameSite=Lax`).
