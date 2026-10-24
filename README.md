# nx-react-nestjs

Boilerplate de produit SaaS multi-tenant : une API NestJS découpée en domaines, un service d'identité, un front React, dans un monorepo Nx. Il fournit ce qu'on réécrit à chaque projet (isolation des tenants, authentification, événements fiables, observabilité, déploiement) et un cadre de développement par specs et tests.

## Ce qu'il contient

```
 navigateur ──► apps/web (React)  ──── cookie de session ───► apps/auth (Better Auth)
                    │                                              │
                    └── access token JWT ──► apps/api (NestJS) ◄── JWKS
                                                  │
                          Postgres (un schéma par domaine) + outbox
                                                  │
                                    worker (BullMQ, Redis) ──► handlers des domaines
```

- **API** (`apps/api`, `libs/api/*`) : un domaine métier par lib Nx (domaine, cas d'usage, adapters, controllers), frontières vérifiées par le lint, isolation par tenant dans chaque repository, erreurs RFC 9457, idempotence, verrou optimiste, feature flags, rate limiting.
- **Événements** : outbox transactionnelle relayée vers BullMQ, handlers idempotents, livraison au moins une fois.
- **Identité** (`apps/auth`) : Better Auth dans un service à part (comptes, organisations = tenants, rôles). L'API ne fait que vérifier des JWT : le fournisseur se remplace par configuration.
- **Front** (`apps/web`, `libs/web/*`) : TanStack Router et Query, design system Tailwind 4 + shadcn avec Storybook, i18n Lingui, budget de poids du bundle.
- **Exploitation** : une image Docker par service, migrations en étape séparée, sondes, arrêt propre, OpenTelemetry (traces, métriques, logs corrélés), Sentry.
- **Qualité** : tests unitaires, d'intégration (Testcontainers), e2e API et parcours navigateur Playwright ; CI sur les projets affectés ; audit des dépendances et Renovate.

<!-- example:start -->

- **Exemples à copier** : `catalog`, `orders` et `notifications` côté API, une boutique (`libs/web/storefront`, `/boutique`, avec `FEATURE_FLAGS=storefront=true` dans `apps/api/.env`) côté front. `pnpm strip:examples` les retire ([Démarrer un projet](docs/guides/demarrer-un-projet.md)).

<!-- example:end -->

Stack : Node 24, TypeScript, Nx, NestJS 11, Drizzle + Postgres 17, Redis 7 + BullMQ, Better Auth, React 19, Vite, Tailwind 4, zod, Vitest, Playwright, oxlint et oxfmt, knip.

## Démarrer

Prérequis : Node 24 (`nvm use`), pnpm via corepack, Docker.

```sh
pnpm install && pnpm dev:setup                          # fichiers .env, Postgres, Redis, Mailpit, migrations
pnpm nx serve api                                       # http://localhost:3000/api/v1, Swagger sur /api/docs
pnpm dev:seed                                           # autre terminal : données de démo
VITE_DEV_TOKEN=$(pnpm -s dev:token) pnpm nx serve web   # http://localhost:4200
```

Ce mode n'utilise pas le service d'identité : le front envoie un token de dev à l'API. Pour se connecter avec de vrais comptes : [Authentification en local](docs/guides/auth-en-local.md).

`pnpm check` lance toutes les vérifications de la CI.

## Développer

Les fonctionnalités se développent avec [Spec Kit](https://github.com/github/spec-kit), déjà configuré pour Claude Code : spec, plan, tâches, puis implémentation en TDD, en commençant par `/speckit-specify <description>`. Pas à pas : [Votre première fonctionnalité](docs/tutorial/premiere-fonctionnalite.md).

## Documentation

- [`AGENTS.md`](AGENTS.md) : commandes, structure, règles et conventions. La référence pour les humains comme pour les agents de code ; à lire avant d'écrire du code.
- [`apps/web/AGENTS.md`](apps/web/AGENTS.md) et [`libs/web/AGENTS.md`](libs/web/AGENTS.md) : conventions du front.
- [`docs/`](docs/README.md) : guides pas à pas.
