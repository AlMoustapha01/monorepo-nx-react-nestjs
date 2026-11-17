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
- **L'infrastructure transverse reste simple** : la file de jobs, la purge, les métriques parcourent une table, pas N.

La contrepartie : une requête qui oublie le filtre lirait les données de tous les tenants. Deux barrières indépendantes l'empêchent : le filtre de chaque repository (ci-dessous) et la Row Level Security de Postgres ([ADR 0013](adr/0013-row-level-security.md)).

### Le tenant vient du token, jamais de la requête

`AuthGuard` vérifie le token et place l'utilisateur, son tenant et ses rôles dans `RequestContext`, un contexte propre à la requête porté par AsyncLocalStorage. Aucun paramètre d'URL, de corps ou d'en-tête ne désigne le tenant : un client ne peut pas en demander un autre.

Lire `tenantId` ou `userId` hors contexte (code exécuté en dehors d'une requête ou d'un handler) lève `TENANT_CONTEXT_MISSING`, une erreur interne : c'est un bug, pas une requête invalide.

### Le repository filtre, toujours

Chaque repository Drizzle a une méthode privée `tenantScope()` (`eq(table.tenantId, this.context.tenantId)`) présente dans chaque lecture et chaque mise à jour, et écrit `tenant_id` depuis le contexte à chaque insertion :

- **Lecture** : une ligne d'un autre tenant n'est pas trouvée.
- **Insertion** : le tenant du contexte remplace celui de l'entité ; une entité forgée ne s'écrit pas ailleurs.
- **Mise à jour** : le filtre tenant s'ajoute à celui de la version (verrou optimiste) ; une ligne d'un autre tenant ne correspond à rien, et la mise à jour échoue en conflit de version. `tenant_id` n'est jamais dans le `SET`.

Les ports des repositories ne prennent jamais de tenant en paramètre : l'implémentation le lit dans le contexte, et le cas d'usage ne peut pas se tromper de tenant.

### Postgres filtre aussi : la Row Level Security

Chaque table d'un domaine porte la politique `tenant_isolation`, déclarée dans son `*.schema.ts` et générée dans la migration. Postgres n'y montre et n'y accepte que les lignes du tenant posé sur la connexion, même si la requête n'a pas de filtre :

- **Le tenant dans chaque transaction** : `DatabaseSession` pose `app.tenant_id` juste après le `BEGIN` de chaque transaction, avec le tenant de `RequestContext` ; une lecture hors transaction passe par le pool de l'API (`TenantScopedPool`), qui l'exécute dans une transaction courte avec le même réglage. Rien ne reste sur la connexion : c'est sûr derrière PgBouncer en mode transaction. Cela couvre aussi les handlers d'événements. Sans tenant dans le contexte, la valeur est `''` : aucune ligne.
- **Un rôle sans privilège** : la RLS ne s'applique ni à un superutilisateur, ni à un rôle `BYPASSRLS`, ni au propriétaire d'une table, sauf si elle est forcée. L'API se connecte avec `app`, propriétaire de la base sans autre privilège (`tools/docker/postgres-init.sql` en local), et les migrations forcent la RLS sur chaque table qui a la politique. En production, l'API refuse de démarrer si son rôle échappe à la RLS.
- **Hors de l'API** : une connexion qui n'a jamais posé `app.tenant_id` (migrations, Drizzle Studio, `psql`, instance d'avant la RLS pendant un déploiement) n'est pas filtrée. La RLS protège contre les oublis du code, pas contre quelqu'un qui détient le rôle, qui pourrait de toute façon la désactiver.

Les tables d'infrastructure (outbox, marques d'idempotence, `Idempotency-Key`) n'ont pas de politique : le worker les parcourt pour tous les tenants. Elles gardent leur `tenant_id` et le filtre du code.

### Ce qui le vérifie

Des tests à chaque niveau :

- **Fakes en mémoire** : ils filtrent par tenant comme la base, donc les tests unitaires des cas d'usage échouent si une règle suppose l'inverse.
- **Tests d'intégration des repositories** (vrai Postgres) : `describeTenantIsolation` (`api-core/testing`) vérifie, pour chaque lecture et chaque écriture, qu'une ligne d'un autre tenant n'est ni lue ni modifiée, et qu'une insertion va dans le tenant du contexte même si l'entité en porte un autre. Il le fait deux fois : avec le filtre du repository seul (session superutilisateur, sans RLS), puis avec la session de l'API. Un `tenantScope()` oublié fait échouer le premier passage.
- **RLS** (`row-level-security.int.spec.ts`, api-core) : chaque table qui a une colonne `tenant_id`, hors infrastructure, porte la politique, active et forcée, avec l'expression de référence ; et le mécanisme tient (hors et dans une transaction, sans tenant, connexion attendue quand le pool est plein).
- **Tests e2e** : une ressource d'un autre tenant répond 404.

Un nouveau repository reprend ces cas (voir [Référence : un domaine de l'API](../reference/domaine-api.md#mapper-et-repository-drizzle-infra)). En revue, une requête Drizzle sans `tenantScope()` est un défaut bloquant.

### Hors des domaines

| Donnée                             | Portée                                                                                                                                |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Outbox (`messaging.outbox`)        | chaque événement porte le tenant et l'auteur ; le worker traite tous les tenants (infrastructure) et transmet le sien au handler      |
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

Le worker de la file de jobs (et son rattrapage des lignes d'outbox non publiées) est la seule pièce qui lit tous les tenants : c'est de l'infrastructure, et il transmet le tenant de chaque événement au handler.

## Limites connues

- **Une connexion hors de l'API n'est pas filtrée** : un script qui ouvre son propre pool avec `DATABASE_URL`, sans poser `app.tenant_id`, lit tous les tenants. Le code de l'API passe toujours par `DatabaseSession`.
- **Un tenant à la fois** : un utilisateur membre de plusieurs organisations agit dans celle de sa session ; il en change par le service d'identité.
- **Rôles à l'échelle du tenant** : `staff` vaut pour tout le tenant. Des droits plus fins (par équipe, par ressource) se modélisent dans le domaine, comme règle d'accès d'un cas d'usage.
