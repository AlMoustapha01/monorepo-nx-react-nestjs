# Architecture : multi-tenant et autorisations

Comment les données d'un tenant restent invisibles aux autres, et comment on décide qui peut faire quoi dans un tenant. Les règles sont dans [`AGENTS.md`](../../AGENTS.md#autorisations) (principes 1 et 3) ; d'où viennent l'utilisateur et le tenant, dans [Authentification](authentification.md).

## Le modèle

- Un **tenant** est une organisation du service d'identité. Son ID (UUID) est dans le token, claim `tenant_id`.
- Tout utilisateur authentifié d'un tenant est un **client**. Un **rôle** ajoute des droits ; il n'y en a qu'un aujourd'hui, `staff` (membre `owner` ou `admin` de l'organisation).
- Trois niveaux de contrôle, chacun à sa place :

| Question                                                | Où                              | Réponse si non         |
| ------------------------------------------------------- | ------------------------------- | ---------------------- |
| Cette donnée est-elle du tenant courant ?               | repository (filtre `tenant_id`) | introuvable (404)      |
| Cette route est-elle permise à ce rôle ?                | `@RequireRole` (guard)          | 403 `FORBIDDEN`        |
| Cette ressource est-elle visible pour cet utilisateur ? | cas d'usage (`RequestContext`)  | 404, comme inexistante |

## Isolation des tenants

### Une base partagée, une colonne `tenant_id`

Tous les tenants partagent les mêmes tables. Chaque table métier a une colonne `tenant_id uuid not null`, et chaque index commence par elle (`(tenant_id, sku)`, `(tenant_id, created_at desc, id desc)`…). Les contraintes d'unicité sont donc par tenant : deux tenants peuvent avoir le même SKU.

Pourquoi ce modèle plutôt qu'un schéma ou une base par tenant :

- **Un tenant ne coûte rien** : une organisation se crée en libre-service depuis le front, sans provisionner de schéma ni de base.
- **Une migration pour tous** : un seul schéma à faire évoluer, en une étape de déploiement, au lieu d'une migration par tenant à orchestrer et à surveiller.
- **L'infrastructure transverse reste simple** : le relais de l'outbox, la purge, les métriques parcourent une table, pas N.

La contrepartie : l'isolation repose sur le code. Une requête qui oublie le filtre lit les données de tous les tenants. Le boilerplate réduit ce risque par construction et par les tests (ci-dessous) ; il n'utilise pas la Row Level Security de Postgres, qui pourrait s'ajouter comme seconde barrière.

### Le tenant vient du token, jamais de la requête

`AuthGuard` vérifie le token et place l'utilisateur, son tenant et ses rôles dans `RequestContext`, un contexte propre à la requête porté par AsyncLocalStorage. Aucun paramètre d'URL, de corps ou d'en-tête ne désigne le tenant : un client ne peut pas en demander un autre.

Lire `tenantId` ou `userId` hors contexte (code exécuté en dehors d'une requête ou d'un handler) lève `TENANT_CONTEXT_MISSING`, une erreur interne : c'est un bug, pas une requête invalide.

### Le repository filtre, toujours

Chaque repository Drizzle a une méthode privée `tenantScope()` (`eq(table.tenantId, this.context.tenantId)`) présente dans chaque lecture et chaque mise à jour, et écrit `tenant_id` depuis le contexte à chaque insertion :

- **Lecture** : une ligne d'un autre tenant n'est pas trouvée.
- **Insertion** : le tenant du contexte remplace celui de l'entité ; une entité forgée ne s'écrit pas ailleurs.
- **Mise à jour** : le filtre tenant s'ajoute à celui de la version (verrou optimiste) ; une ligne d'un autre tenant ne correspond à rien, et la mise à jour échoue en conflit de version. `tenant_id` n'est jamais dans le `SET`.

Les ports des repositories ne prennent jamais de tenant en paramètre : l'implémentation le lit dans le contexte, et le cas d'usage ne peut pas se tromper de tenant.

### Ce qui le vérifie

Pas de mécanisme global : une convention, vérifiée par des tests à chaque niveau.

- **Fakes en mémoire** : ils filtrent par tenant comme la base, donc les tests unitaires des cas d'usage échouent si une règle suppose l'inverse.
- **Tests d'intégration des repositories** (vrai Postgres) : pour chaque méthode, une ligne d'un autre tenant n'est ni lue ni modifiée, et une insertion va dans le tenant du contexte même si l'entité en porte un autre.
- **Tests e2e** : une ressource d'un autre tenant répond 404.

Un nouveau repository reprend ces cas (voir [Référence : un domaine de l'API](../reference/domaine-api.md#mapper-et-repository-drizzle-infra)). En revue, une requête Drizzle sans `tenantScope()` est un défaut bloquant.

### Hors des domaines

| Donnée                             | Portée                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Outbox (`messaging.outbox`)        | chaque événement porte le tenant et l'auteur ; le relais les lit tous (infrastructure) et les transmet au handler                     |
| Marques d'idempotence des handlers | `tenant_id` enregistré ; clé `(handler, event_id)`                                                                                    |
| `Idempotency-Key`                  | clé `(tenant_id, user_id, key)` : deux utilisateurs peuvent envoyer la même valeur                                                    |
| Rate limiting                      | par utilisateur (`user:<id>`), par IP sans token                                                                                      |
| Logs, Sentry, traces               | `tenantId` et `userId` dans chaque log de requête ; tag `tenant_id` dans Sentry ; attribut `app.tenant.id` sur les spans des handlers |

### Sans tenant

Un token sans tenant (utilisateur sans organisation) est refusé : 401 `UNAUTHENTICATED`, comme un token invalide. Seules les routes `@Public()` répondent sans token, donc sans tenant : aujourd'hui `/health` et `/ready`. Le front envoie un utilisateur sans organisation vers la création d'une organisation.

## Rôles : qui peut appeler une route

- `ROLES` (api-core) liste les rôles connus de l'application ; un rôle inconnu dans le token est ignoré, jamais interprété.
- `@RequireRole('staff')` sur une méthode ou un controller réserve la route ; le `RolesGuard` global répond 403 `FORBIDDEN` sinon.
- Principe 3 : toute route qui modifie des données partagées du tenant (le catalogue) déclare son rôle. Une route qui ne modifie que les données de l'utilisateur (passer ou annuler sa commande) n'en a pas besoin : c'est le cas d'usage qui vérifie la propriété.

L'ordre des guards globaux compte : authentification (401), rate limiting (par utilisateur, donc après), feature flag (404, avant tout 403 : une route coupée ne révèle même pas qu'elle demande un rôle), rôles (403).

Ajouter un rôle : l'ajouter à `ROLES`, puis le faire émettre par le fournisseur d'identité (`apps/auth/src/claims.ts` pour Better Auth).

## Accès aux ressources : qui peut voir quoi

La propriété et la visibilité d'une ressource sont des règles métier : elles vivent dans le cas d'usage, qui lit `RequestContext` (`userId`, `hasRole`). Jamais dans le controller, qui ne fait que traduire HTTP.

Règles actuelles :

| Ressource | Client                           | Staff                         |
| --------- | -------------------------------- | ----------------------------- |
| Produit   | lit les produits publiés         | lit et gère tout le catalogue |
| Commande  | lit, passe et annule les siennes | voit toutes celles du tenant  |

Deux formes :

- **Une ressource** : le cas d'usage charge, puis vérifie (`GetOrder` : staff, ou commande du client). Les autres cas d'usage sur la même ressource (`CancelOrder`) passent par lui et héritent de la règle.
- **Une liste** : le cas d'usage restreint la requête du repository (`customerId: userId` pour un client, aucun filtre pour le staff), avec un index qui sert ce filtre.

### Pourquoi 404 et pas 403

Une ressource qu'on n'a pas le droit de voir répond 404, exactement comme une ressource inexistante ou d'un autre tenant. Un 403 confirmerait qu'elle existe : un client pourrait sonder les IDs des commandes de ses voisins ou les brouillons du catalogue. La même logique vaut pour un produit indisponible dans une commande (422 identique qu'il soit inconnu, d'un autre tenant ou non publié) et pour une route derrière un flag coupé (404).

Le 403 reste pour le cas où la route elle-même est interdite au rôle : l'existence de la route n'est pas un secret.

## Handlers d'événements

Un handler s'exécute au nom du tenant et de l'auteur de l'événement, **sans rôle** (`RequestContext.runAs`). Conséquences :

- les repositories restent filtrés par tenant, sans rien changer ;
- le handler passe par les repositories, pas par les cas d'usage : leurs règles d'accès visent l'utilisateur d'une requête et refuseraient à tort (le client qui a passé la commande ne voit pas les produits archivés, mais le compteur de ventes doit bouger quand même).

Le relais de l'outbox est la seule pièce qui lit tous les tenants : c'est de l'infrastructure, et il transmet le tenant de chaque événement au job.

## Limites connues

- **Isolation par le code** : pas de RLS. Un repository écrit sans `tenantScope()` et sans ses tests fuit.
- **Un tenant à la fois** : un utilisateur membre de plusieurs organisations agit dans celle de sa session ; il en change par le service d'identité.
- **Rôles à l'échelle du tenant** : `staff` vaut pour tout le tenant. Des droits plus fins (par équipe, par ressource) se modélisent dans le domaine, comme règle d'accès d'un cas d'usage.
