# 0020. Flags par tenant pilotés depuis le back-office, avec trace

- **Statut** : Acceptée
- **Date** : 2026-11-17
- **Remplace** le pilotage par commande de [0014](0014-feature-flags-par-tenant.md), dont la table, la priorité et l'évaluation ne changent pas

## Contexte

Avec l'ADR 0014, ouvrir une fonctionnalité à un client pilote demandait une commande d'exploitation (`node feature-flags.js`) lancée là où l'API a ses secrets, sans trace d'audit hors des logs de l'orchestrateur. L'ADR prévoyait de la remplacer par un back-office du staff de la plateforme, journal d'audit compris. Ce back-office existe depuis l'ADR 0019, avec ses opérateurs.

## Décision

- **Au back-office** (`/support`) : pour chaque organisation d'un compte trouvé, « Flags de … » montre tous les flags du catalogue, avec leur description, et pour chacun un choix : « Comme tous » (pas de surcharge : `FEATURE_FLAGS`, puis la valeur du catalogue, affichée), « Activé pour cette organisation » ou « Désactivé pour cette organisation ».
- **Servi par le service d'identité**, comme la recherche de comptes : `GET /api/auth/operator/feature-flags?organizationId=` et `POST /api/auth/operator/feature-flags` (`{ organizationId, flag, value: on|off|default }`), réservés aux opérateurs (403 `OPERATOR_REQUIRED`), **2FA de l'opérateur exigée pour changer une valeur** (403 `OPERATOR_TWO_FACTOR_REQUIRED`), comme pour l'impersonation. Un flag hors du catalogue ou une valeur inconnue : 400 ; une organisation inconnue : 404. Il écrit dans `feature_flags.tenant_overrides`, la table que lit l'API (ADR 0014), comme il écrit déjà dans `audit.entries` et `access.revocations` : même rôle Postgres, sans tenant posé, que la RLS laisse voir tous les tenants. L'API, elle, n'accepte que des tokens avec tenant, qu'un opérateur n'a pas.
- **Journal du client** : chaque changement écrit `identity.feature-flag-changed` dans le journal de l'organisation, l'opérateur pour acteur, `{ flag, value }` pour détails. Le client le voit (« Flag modifié par le support »).
- **La commande `node feature-flags.js` et `pnpm dev:flag` sont retirés** : une seule voie, tracée. En local, on nomme un opérateur (`pnpm dev:operator grant <email>`) et on passe par le back-office.
- Comme tout le mécanisme des flags, ce code part avec l'option `feature-flags` de `pnpm create:project`.

## Conséquences

- Le service d'identité ne lit pas `FEATURE_FLAGS` (variable de l'API) : « Comme tous » affiche la valeur du catalogue, et la page rappelle que la variable peut la changer.
- Un changement s'applique dès la requête suivante de l'API, sur toutes les instances (ADR 0014) ; le front du client le voit à son prochain chargement de page.
- Les lignes d'un flag retiré du code ne sont plus listées par une commande : elles restent ignorées par l'API, et le back-office ne montre que le catalogue. Les supprimer demande une requête SQL, ou une migration qui nettoie, au retrait du flag.
- Plus de pilotage sans opérateur : un projet qui veut des pilotes nomme d'abord un opérateur.

## Alternatives écartées

- **Garder la commande à côté du back-office** : deux voies, dont une sans trace dans le journal du client.
- **Routes dans l'API** : l'API exige un token avec tenant (principe 1) ; y faire entrer un opérateur sans tenant toucherait au contrat d'authentification pour une seule page.
- **Laisser le staff du tenant choisir** : écarté par l'ADR 0014, pour la même raison (il activerait des fonctionnalités inachevées).
