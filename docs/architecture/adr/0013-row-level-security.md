# 0013. Row Level Security de Postgres en seconde barrière d'isolation des tenants

- **Statut** : Acceptée
- **Date** : 2026-11-16
- **Complète** : [0003](0003-multi-tenant-base-partagee.md), dont le modèle ne change pas

## Contexte

L'ADR 0003 fait reposer l'isolation des tenants sur le code : chaque repository filtre sur le `tenant_id` du contexte (`tenantScope()`), et ses tests le vérifient. Une requête qui oublie le filtre lit ou modifie les données de tous les tenants, et rien ne la rattrape. C'est le risque le plus grave d'un SaaS multi-tenant, et il ne dépend que d'une revue attentive.

L'API se connectait aussi en superutilisateur en dev et en test (`app`, créé par l'image Postgres) : la RLS, si on l'avait ajoutée, n'y aurait rien filtré.

## Décision

- **Une politique par table d'un tenant** : `tenant_isolation`, déclarée dans le `*.schema.ts` du domaine (`pgPolicy`), donc générée dans la migration par drizzle-kit (principe 5). Elle s'applique en lecture (`USING`) et en écriture (`WITH CHECK`) :

  ```sql
  coalesce(current_setting('app.tenant_id', true), '') = ''
    or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid
  ```

- **Le tenant dans chaque transaction** : `set_config('app.tenant_id', <tenant>, true)`, valable pour la seule transaction en cours, avec le tenant de `RequestContext` lu dans le contexte de l'appelant. `DatabaseSession.transaction` le pose juste après son `BEGIN`. Une requête hors transaction passe par le pool de l'API (`TenantScopedPool`), qui l'exécute dans une transaction courte : `BEGIN` et réglage en un aller-retour, la requête, `COMMIT`. Rien ne reste sur la connexion, ce qui est sûr derrière un pooler en mode transaction (PgBouncer). Les handlers du worker s'exécutent dans le contexte de l'événement et passent par les mêmes chemins. Sans tenant dans le contexte, la valeur est l'UUID nul (`NO_TENANT`), qu'aucun tenant ne porte : la base ne montre et n'accepte aucune ligne.
- **Un rôle propriétaire sans privilège** : l'API, le worker, les migrations et le service d'identité se connectent avec un rôle qui possède la base mais n'est ni superutilisateur ni `BYPASSRLS`. En local et dans les tests, l'image Postgres crée le superutilisateur `postgres`, et `tools/docker/postgres-init.sql` crée `app` ; `DATABASE_URL` ne change pas.
- **RLS forcée** : la RLS ne s'applique pas au propriétaire d'une table, sauf si elle est forcée, ce que drizzle-kit ne génère pas. `applyMigrations` (api-core, appelée par `migrate.js`, `api:db-migrate` et les tests) exécute `FORCE ROW LEVEL SECURITY`, après les migrations, sur chaque table qui porte la politique `tenant_isolation`. Seulement celles-là : Graphile Worker active la RLS, sans politique, sur ses tables privées.
- **Garde au démarrage** : l'API lit `rolsuper` et `rolbypassrls` de son rôle. En production, elle refuse de démarrer s'il échappe à la RLS ; ailleurs, elle l'écrit dans les logs.
- **Périmètre** : les tables des domaines. L'outbox, les marques d'idempotence des handlers et les `Idempotency-Key` restent des tables d'infrastructure, que le worker parcourt pour tous les tenants (purge, rattrapage) : elles gardent leur `tenant_id` et le filtre du code, sans politique.
- **Tests** : un test d'api-core vérifie que chaque table qui a une colonne `tenant_id`, hors infrastructure, porte la politique, active et forcée, avec l'expression de référence (`TENANT_ROWS_SQL`) ; il vérifie aussi le mécanisme (hors et dans une transaction, sans tenant, connexion attendue quand le pool est plein). `describeTenantIsolation` (api-core/testing) vérifie chaque lecture et chaque écriture d'un repository, une fois avec son filtre seul (session superutilisateur, sans RLS), une fois avec la session de l'API.

## Conséquences

- **Deux barrières indépendantes** : un repository qui oublie `tenantScope()` ne fuit plus, et `describeTenantIsolation` le signale quand même (le passage « filtre seul » échoue). Le filtre du code reste obligatoire : il sert aussi les index et garde les fakes en mémoire fidèles.
- **Coût** : un aller-retour de plus par transaction (le réglage), deux par lecture hors transaction (`BEGIN` avec le réglage, puis `COMMIT`).
- **Compatible avec un déploiement progressif** : un réglage non posé n'est pas filtré. Il vaut NULL sur une connexion qui ne l'a jamais posé, et `''` sur une connexion où une transaction l'a posé puis s'est terminée : derrière PgBouncer, une ancienne instance peut hériter d'une connexion serveur utilisée par une nouvelle. C'est pourquoi l'API pose l'UUID nul, et pas `''`, quand elle n'a pas de tenant. Sont concernés l'instance d'avant la RLS, les migrations, Drizzle Studio et `psql`. Les anciennes instances continuent de fonctionner pendant le déploiement (principe 5). Ce n'est pas une faiblesse de plus : le rôle propriétaire peut de toute façon désactiver la RLS. Elle protège contre les oublis du code de l'API, pas contre quelqu'un qui détient le rôle.
- **Base locale existante** : créée avant ce changement, elle a `app` pour superutilisateur, et la RLS n'y filtre rien (avertissement au démarrage). La recréer : `pnpm dev:down -v && pnpm dev:setup`.
- **Production** : le rôle de `DATABASE_URL` possède les schémas qu'il migre, sans `SUPERUSER` ni `BYPASSRLS`. C'est le cas par défaut d'un rôle créé pour l'application sur une base managée ; un rôle d'administration qui a `BYPASSRLS` est refusé.
- **Une requête Drizzle s'exécute à son `await`** : `context.runAs(principal, () => db.select()…)` qui renvoie la requête sans l'attendre l'exécute hors du contexte, donc sans tenant. Les méthodes `async` des repositories attendent leurs requêtes : elles ne sont pas concernées.
- **Nouvelle table d'un tenant** : sa politique s'écrit dans son `*.schema.ts`, et le test d'api-core échoue si on l'oublie.
- **`api:db-migrate`** construit l'API et exécute `migrate.js` : le dev applique ses migrations par le même code que la production.

## Alternatives écartées

- **Deux rôles, deux URL** (un propriétaire pour les migrations, un rôle d'exécution non propriétaire) : pas besoin de forcer la RLS, mais des `GRANT` et des privilèges par défaut à tenir pour chaque nouveau schéma, et une variable de plus partout (API, worker, service d'identité, e2e).
- **Une migration écrite à la main pour `FORCE`** (`db-generate --custom`) : explicite, mais à refaire pour chaque nouvelle table, et contraire au principe 5.
- **Le tenant posé pour toute la session, à chaque emprunt d'une connexion** (`set_config(…, false)`) : un aller-retour de moins par lecture, mais derrière PgBouncer en mode transaction, la requête suivante peut partir sur une autre connexion serveur. Elle porterait alors le tenant d'un autre client (écritures refusées) ou aucun (RLS sans effet, sans que personne le voie).
- **Une politique stricte quand le réglage est absent** : elle échouerait en sécurité pour une connexion qui oublie de le poser, mais les anciennes instances ne verraient plus aucune ligne pendant le déploiement, et Drizzle Studio non plus.
- **La RLS sur les tables d'infrastructure** : il faudrait un rôle `BYPASSRLS` ou des fonctions `SECURITY DEFINER` pour la purge et le rattrapage, qui lisent tous les tenants.
