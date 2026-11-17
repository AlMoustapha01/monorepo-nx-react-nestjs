# 0015. Journal d'audit par tenant, écrit par les événements de l'API et par les hooks du service d'identité

- **Statut** : Acceptée
- **Date** : 2026-11-17

## Contexte

Un client B2B demande qui a fait quoi, et quand, dans son organisation : connexions, membres invités ou retirés, rôles, actions métier. Les événements d'intégration portent déjà le tenant, l'auteur et la date d'une action de l'API. Les actions d'identité (connexion, membres) n'en sont pas : elles ont lieu dans `apps/auth`, sans outbox.

## Décision

- **Un domaine `audit`** (`libs/api/audit`), schéma `audit`, table `audit.entries` sous la RLS (ADR 0013) : tenant, auteur (UUID, null pour le système), action `<domaine>.<fait-au-passé>`, ressource (type et ID), détails (valeurs simples), date, `trace_id`. Une ligne n'est jamais modifiée ni supprimée par l'application.
- **Actions de l'API** : le domaine `audit` déclare les événements d'intégration qu'il inscrit (`AUDITED_EVENT_HANDLERS`), un handler chacun (`auditEvent`). Le domaine émetteur n'en sait rien. Le handler est transactionnel : un événement livré deux fois ne laisse qu'une ligne ; il écrit au nom de l'auteur de l'événement et à sa date.
- **Actions d'identité** : un hook `after` de Better Auth (`apps/auth/src/audit.ts`, API publique) écrit dans `audit.entries` après une connexion, une invitation, une arrivée, un retrait ou un changement de rôle. Il écrit avec le rôle Postgres `app`, sans lire la table. Contrats partagés (actions, préfixe `AUD`, générateur d'IDs) dans `libs/shared/contracts`.
- **Lecture** : `GET /api/v1/audit/entries`, réservée au staff du tenant (`@RequireRole('staff')`), paginée par curseur, filtrable par auteur et par action, derrière le flag `audit.log`. Page `/journal` du front ; les noms des auteurs viennent des membres de l'organisation (`listMembers` du client d'auth).
- **Données personnelles** : ni email ni nom dans le journal, seulement des IDs et des valeurs simples ; le nom s'affiche à la lecture, depuis le service d'identité. L'effacement d'une personne ne laisse pas sa donnée dans le journal.

## Conséquences

- Les actions d'identité ne sont pas atomiques avec leur écriture : le hook s'exécute après le commit de Better Auth. Une ligne se perd si le process meurt entre les deux, ou si Postgres refuse l'écriture (table absente, base indisponible) ; l'action de l'utilisateur n'échoue jamais pour autant, et la perte est journalisée (`Audit entry lost`) et signalée à Sentry.
- `apps/auth` écrit dans un schéma de l'API : exception à « un schéma par domaine ». Ordre de déploiement : `migrate.js` de l'API avant le service d'identité, sinon ses lignes se perdent jusqu'à la migration.
- L'écriture ne dépend pas du flag : le journal est complet le jour où on l'ouvre au staff.
- Pas de purge : la durée de conservation est une décision du produit (contrat, loi), à ajouter par une tâche planifiée.
- Une ligne de plus par événement audité, dans la transaction de son handler ; un aller-retour Postgres de plus par action d'identité, et une lecture de session pour les routes d'organisation.

## Alternatives écartées

- **Outbox dans `apps/auth`** : essayée. Better Auth 1.7 exécute ses hooks `after*` après le commit et réinitialise son contexte de transaction à chaque requête (`auth.handler`) ; une écriture atomique exigerait son API interne (`@better-auth/core/context`), qu'une mise à jour peut casser sans prévenir.
- **Triggers Postgres sur les tables de Better Auth** : atomiques, mais sans l'auteur de l'action (« X a retiré Y » devient « Y a été retiré »), et du SQL écrit à la main hors des migrations générées (principe 5).
- **Auditer tous les événements d'intégration** : du bruit (projections, compteurs) et des payloads qui contiennent des emails.
