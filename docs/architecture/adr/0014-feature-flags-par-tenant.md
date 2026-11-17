# 0014. Feature flags par tenant, en base, pilotés par une commande d'exploitation

- **Statut** : Acceptée ; pilotage par commande remplacé par [0020](0020-flags-par-tenant-au-back-office.md) (back-office)
- **Date** : 2026-11-17
- **Complète** : [0008](0008-feature-flags-dans-le-code.md), dont le catalogue et la surcharge par l'environnement ne changent pas

## Contexte

Avec l'ADR 0008, un flag vaut la même chose pour tous les tenants, et le changer demande un redémarrage. Un SaaS B2B ouvre pourtant une fonctionnalité à quelques clients pilotes avant tout le monde, ou la retire à un client qu'elle gêne, sans toucher aux autres ni redéployer.

## Décision

- **Une surcharge par tenant et par flag**, dans la table `feature_flags.tenant_overrides` (`tenant_id`, `flag`, `enabled`, `updated_at`), sous la RLS comme les tables métier (ADR 0013).
- **Priorité** : la surcharge du tenant, sinon `FEATURE_FLAGS`, sinon la valeur par défaut du catalogue. Elle sert à activer un pilote quand le flag est coupé pour tous, comme à exclure un tenant quand il est activé pour tous.
- **Évaluation** : `TenantFeatureFlags` remplace `ConfiguredFeatureFlags` derrière le port `FeatureFlags`, sans toucher aux appelants (`@RequireFeature`, `isEnabled`, `GET /feature-flags`). Les surcharges du tenant sont lues une fois par requête, au premier flag évalué, puis gardées dans le contexte de la requête. Un changement vaut dès la requête suivante, sur toutes les instances, sans cache à invalider.
- **Pilotage** : une commande d'exploitation, `node feature-flags.js list [<tenantId>] | set <flag> <tenantId> on|off | clear <flag> <tenantId>` (même image que l'API ; `pnpm dev:flag` en local). Elle refuse un flag absent du catalogue, un tenant qui n'est pas un UUID et une valeur autre que `on` ou `off`. Pas de route HTTP : `staff` administre un tenant, pas la plateforme, et un client ne choisit pas seul d'entrer dans un pilote.
- **Flag retiré du code** : ses lignes restent en base et sont ignorées ; `list` les signale, `clear` les supprime.

## Conséquences

- Une requête SQL indexée (clé primaire) de plus, seulement sur les requêtes qui évaluent un flag avec un tenant ; aucune sinon.
- Un worker ou un handler d'événement évalue les flags au nom du tenant de l'événement : la surcharge s'y applique aussi.
- Le front relit les flags au changement d'organisation (`reloadForNewTenant`), mais pas pendant une session : un changement s'y voit au prochain chargement de la page.
- La commande s'exécute là où l'API a ses secrets (job ponctuel de l'orchestrateur, `docker compose run`) : elle n'ajoute aucune surface d'attaque, mais aucune trace d'audit hors des logs de l'orchestrateur. Un back-office du staff de la plateforme, avec journal d'audit, la remplacera.
- Pas de ciblage par utilisateur ni par pourcentage : le port le permettrait, par une autre implémentation.

## Alternatives écartées

- **Route API réservée au staff** : le staff est l'administrateur d'un tenant ; il activerait lui-même des fonctionnalités inachevées. Un rôle d'opérateur de la plateforme n'existe pas encore.
- **Cache par process** (30 s) : moins de requêtes, mais un changement se propagerait à des moments différents selon les instances, et un test devrait attendre l'expiration.
- **`FEATURE_FLAGS` prioritaire sur le tenant** : un interrupteur global d'incident, mais un flag forcé pour tous ne pourrait plus être retiré à un tenant. Couper partout reste possible : supprimer les surcharges du flag, puis le couper dans l'environnement.
- **Service externe** (Unleash, LaunchDarkly, flagd) : ciblage plus riche, mais un fournisseur, un coût et une dépendance réseau de plus ; le port permet de le brancher plus tard.
