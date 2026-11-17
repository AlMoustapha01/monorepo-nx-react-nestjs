# 0016. Révocation des accès en quelques secondes, par une liste en Postgres consultée par l'API

- **Statut** : Acceptée
- **Date** : 2026-11-17

## Contexte

L'API vérifie seule des access tokens de 15 minutes (ADR 0006) : un membre retiré, ou un admin repassé simple membre, garde ses droits jusqu'à l'expiration de son token. Pour un client B2B, c'est souvent la première objection. Le service d'identité connaît le changement, l'API ne le voit qu'au token suivant.

## Décision

- **Une liste de révocation** `access.revocations` (schéma de l'API, sous la RLS de l'ADR 0013) : une ligne par utilisateur et par tenant, `revoked_at`. L'API refuse (401) tout token de ce tenant dont l'`iat` tombe avant la fin de la seconde de la révocation. Une révocation suivante met la date à jour : la table ne grossit qu'avec le nombre de couples utilisateur et tenant qui ont changé, sans purge.
- **Écrite par le service d'identité**, par les hooks de Better Auth, pour le retrait d'un membre, son départ, un changement de rôle et la suppression d'une organisation (tous ses membres). **Avant l'action** : si l'écriture échoue, l'action est refusée (503), plutôt que de laisser l'accès ouvert 15 minutes. Puis **à sa fin**, au mieux : la date avance, pour couvrir un token émis pendant l'action, encore avec l'ancien accès.
- **Lue par l'`AuthGuard`** à chaque requête authentifiée, par clé primaire, au nom du principal du token. Si la liste est illisible, la requête passe, avec un avertissement journalisé au plus une fois par minute : sans Postgres, les routes qui touchent aux données échouent de toute façon, et la panne ne doit pas aussi couper les autres.
- **Le front ne change pas** : sur un 401, il redemande un token et rejoue la requête une fois. Le token neuf porte les droits du moment, ou pas de tenant pour un membre retiré.
- **Sans feature flag** : c'est la correction d'une limite de sécurité acceptée par l'ADR 0006, pas une fonctionnalité qu'on ouvre à des clients. Coupée par défaut, elle laisserait l'accès ouvert.

## Conséquences

- Un accès retiré est refusé dès la requête suivante, sur toutes les instances. Le reste du contrat ne bouge pas : un autre fournisseur d'identité fonctionne toujours, mais sans révocation tant qu'il n'écrit pas dans la liste.
- Une lecture Postgres de plus par requête authentifiée (clé primaire, sous la milliseconde).
- `iat` est à la seconde : un token émis dans la seconde de la révocation est refusé, même s'il l'a suivie. Le front qui redemande un token dans cette seconde voit un second 401, et la requête échoue une fois ; la suivante passe.
- Un token sans `iat` est refusé dès qu'une révocation existe pour son utilisateur dans son tenant.
- La date de révocation vient de l'horloge du service d'identité, celle qui date aussi ses tokens. Un autre fournisseur qui écrirait dans la liste doit faire de même.
- Un membre arrivé pendant la suppression de son organisation, entre la lecture des membres et la fin de la suppression, n'est pas révoqué : son token éventuel, émis dans ces millisecondes, reste valable jusqu'à son expiration.
- Comme pour le journal d'audit (ADR 0015), `apps/auth` écrit dans un schéma de l'API : la migration de l'API passe avant le service d'identité. Sans la table, le retrait d'un membre, un changement de rôle et la suppression d'une organisation sont refusés.
- Non couvert : la fin d'une session (déconnexion, sessions révoquées, mot de passe changé), dont le token reste valable jusqu'à son expiration. Même mécanisme à étendre, avec une révocation par utilisateur, tous tenants confondus.

## Alternatives écartées

- **Tokens plus courts (1 à 2 minutes)** : réduit la fenêtre sans la fermer, et multiplie les appels au service d'identité.
- **Liste dans Redis** : Redis redeviendrait critique pour la sécurité, alors qu'il ne porte que des compteurs perdables (ADR 0012).
- **Événement du service d'identité vers l'API** : `apps/auth` n'a pas d'outbox (ADR 0015), et un événement asynchrone rouvre une fenêtre, plus courte mais non bornée.
- **Introspection du token auprès du fournisseur à chaque requête** : un aller-retour réseau par requête, et l'API dépend de la disponibilité du service d'identité.
