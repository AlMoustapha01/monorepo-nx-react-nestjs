# Authentification en local

Le contrat entre l'API et le fournisseur d'identité est décrit dans [`AGENTS.md`](../../AGENTS.md) § « Authentification ». Ce guide explique comment choisir le mode en local.

## Deux modes

L'API vérifie les tokens avec **l'un ou l'autre** de ces réglages de `apps/api/.env`, jamais les deux :

| Mode                 | Variable                                            | Usage                                                         |
| -------------------- | --------------------------------------------------- | ------------------------------------------------------------- |
| Secret partagé HS256 | `AUTH_JWT_SECRET`                                   | Défaut de `apps/api/.env` ; `dev:token`, `signTestToken`, e2e |
| Service d'identité   | `AUTH_JWKS_URL=http://localhost:3100/api/auth/jwks` | Vrais comptes, connexion dans le front                        |

`AUTH_JWT_SECRET` est refusé en production.

## Mode token de dev (par défaut)

Aucune connexion : `pnpm -s dev:token` signe un token avec le secret, pour un utilisateur et un tenant de dev fixes.

```sh
pnpm -s dev:token                    # client de dev, sans rôle
pnpm -s dev:token --staff            # staff de dev : gestion du tenant
pnpm -s dev:token --new-tenant       # un autre tenant, vide
pnpm -s dev:token --tenant <uuid> --user <uuid> --email a@b.c --expires 1h
pnpm -s dev:token --no-email
```

Pour curl : `TOKEN=$(pnpm -s dev:token) && curl -H "authorization: Bearer $TOKEN" http://localhost:3000/api/v1/…`.

Dans le front : `VITE_DEV_TOKEN=$(pnpm -s dev:token) pnpm nx serve web`, ou la valeur dans `apps/web/.env`. Le token n'est jamais inclus dans un build de production.

## Mode service d'identité

1. Dans `apps/api/.env`, commenter `AUTH_JWT_SECRET` et décommenter `AUTH_JWKS_URL=http://localhost:3100/api/auth/jwks`.
2. Lancer le service, puis l'API :

   ```sh
   pnpm nx serve auth   # http://localhost:3100/api/auth
   pnpm nx serve api
   ```

3. `pnpm dev:seed` crée l'organisation « Boutique de démo » (le tenant), deux comptes et les données de démo, avec le mot de passe `demo-password-1234` :
   - `staff@shop.local` : propriétaire de l'organisation, rôle `staff` ;
   - `dev@shop.local` : membre, client.
4. Lancer le front **sans** `VITE_DEV_TOKEN` : `pnpm nx serve web`, puis se connecter sur http://localhost:4200/connexion.

Dans ce mode, `pnpm -s dev:token [--staff]` renvoie le vrai token (15 min) de l'un des deux comptes, pour la doc de l'API (`/api/docs`) ou curl ; les autres options sont refusées.

Les emails (vérification, mot de passe oublié, invitations) arrivent dans Mailpit : http://localhost:8025.

## Changer de fournisseur

L'API n'a besoin que d'un fournisseur qui publie un JWKS et met des UUID dans `sub` et dans la claim du tenant. Régler `AUTH_JWKS_URL`, `AUTH_JWT_ISSUER`, `AUTH_JWT_AUDIENCE`, et si besoin `AUTH_TENANT_CLAIM` et `AUTH_ROLES_CLAIM` (chemin pointé accepté, par exemple `app_metadata.tenant_id`). `apps/auth` et `libs/web/auth` deviennent alors inutiles.
