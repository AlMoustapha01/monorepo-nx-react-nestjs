# Décisions d'architecture (ADR)

Une décision structurante par fichier : le contexte, ce qui a été décidé, ce que ça coûte. Un ADR explique pourquoi le code est ainsi ; [`AGENTS.md`](../../../AGENTS.md) dit comment s'y conformer.

| N°                                           | Décision                                                                    | Statut   |
| -------------------------------------------- | --------------------------------------------------------------------------- | -------- |
| [0001](0001-monolithe-modulaire.md)          | Une API en monolithe modulaire, un domaine par lib Nx                       | Acceptée |
| [0002](0002-schema-postgres-par-domaine.md)  | Un schéma Postgres par domaine, sans clé étrangère entre domaines           | Acceptée |
| [0003](0003-multi-tenant-base-partagee.md)   | Multi-tenant en base partagée, filtré par `tenant_id` dans les repositories | Acceptée |
| [0004](0004-identifiants-metier-prefixes.md) | Identifiants métier préfixés et triables par date                           | Acceptée |
| [0005](0005-outbox-et-bullmq.md)             | Événements d'intégration par outbox transactionnelle et BullMQ              | Acceptée |
| [0006](0006-service-d-identite-separe.md)    | Identité dans un service à part, l'API vérifie des JWT                      | Acceptée |
| [0007](0007-une-image-trois-commandes.md)    | Une image, trois commandes ; migrations en étape de déploiement             | Acceptée |
| [0008](0008-feature-flags-dans-le-code.md)   | Feature flags déclarés dans le code, surchargés par l'environnement         | Acceptée |
| [0009](0009-erreurs-rfc-9457.md)             | Erreurs métier typées, converties en RFC 9457 en un seul endroit            | Acceptée |
| [0010](0010-stack-du-front.md)               | Stack du front                                                              | Acceptée |
| [0011](0011-developpement-par-specs.md)      | Développement par specs (Spec Kit), en TDD, avec traçabilité                | Acceptée |

Les ADR 0001 à 0011 ont été écrits après coup, en octobre 2026, à partir du code, des messages de commit et des documents de conception de [`docs/archive`](../../archive/README.md). La date de chacun est celle du commit qui a introduit la décision. Quand les alternatives écartées n'étaient écrites nulle part, l'ADR le dit.

## Écrire un ADR

- Quand : une décision difficile à défaire, ou qu'un nouvel arrivant remettrait en cause faute d'en connaître la raison (choix de technologie, frontière, garantie, compromis de sécurité).
- Fichier : `NNNN-<sujet>.md`, numéro suivant, en français comme le reste de `docs/`. Ajouter sa ligne ci-dessus.
- Plan : **Statut**, **Date**, **Contexte**, **Décision**, **Conséquences**, et **Alternatives écartées** si elles ont été étudiées.
- Un ADR accepté ne se réécrit pas : une décision qui change fait l'objet d'un nouvel ADR, et l'ancien passe en `Remplacée par NNNN`. Une règle qui en découle change aussi dans `AGENTS.md`.
