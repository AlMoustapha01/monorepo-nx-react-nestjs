# Nx React NestJS Boilerplate Constitution

The convention files listed under `docs` in `.specify/stack.yml` (`AGENTS.md` at the repository root, `apps/web/AGENTS.md` and `libs/web/AGENTS.md`) are the detailed reference for the project's principles below, and they prevail over this text when the two differ on a detail. They never loosen the four principles of the Artefact CI base (I to IV): a convention that contradicts one of them is a deviation, justified in Complexity Tracking and decided by the user. This constitution names the principles that every spec, plan and task is checked against; it does not restate those files.

## Core Principles

### I. Test-First (NON-NEGOTIABLE)

No production code is written without a test that failed first, for the expected reason. Every change follows red → green → refactor. Every acceptance scenario of a spec is covered by an automated test whose title starts with the scenario id (`003-US1-AS2: …`), which `pnpm -s spec:trace` checks. A scenario is never renumbered nor deleted: it is retired, and no test may cite a retired scenario. Test levels:

- unit tests on `domain/` and `application/`, with in-memory fakes and no ORM mocks;
- integration tests (`*.int.spec.ts`) against a real Postgres (Testcontainers);
- API end-to-end tests (`apps/api/tests/*.e2e.spec.ts`) through `configureApp` and supertest;
- front-end component tests (Vitest + Testing Library) next to the screens in `libs/web/*`;
- browser journeys (`apps/web-e2e`, Playwright) only for what Vitest cannot see: redirects between services, emails, cookies, several tenants.

See `AGENTS.md` § "Conventions" (tests), `apps/web/AGENTS.md` and `libs/web/AGENTS.md` for the front end.

### II. Incremental Delivery

Each user story is delivered in its own pull request. When `flags` is `true` in `.specify/stack.yml`, every new feature also ships behind a feature flag, disabled by default, declared and guarded as the convention files say. See `AGENTS.md` § "Développer une fonctionnalité (Spec Kit)".

<!-- option:feature-flags:start -->

Here `flags` is `true`: see `AGENTS.md` § "Principes non négociables", point 6, and § "Conventions" (feature flags).

<!-- option:feature-flags:end -->

### III. Independent Review

Whoever produces the work does not validate it. Before a story is handed over, an independent reviewer, in a fresh context and without the author's summary, applies `.specify/extensions/artefact-product/agents/relecteur.md`; each blocking finding becomes a task, and a disputed one goes to a human.

### IV. Living Specs

Once merged, `spec.md` describes the current behavior and stays current: a pull request that changes a specified behavior updates its spec; the spec's status (`Draft`, `Implemented`, `Shipped`, `Retired`) follows the feature's lifecycle. `plan.md` and `tasks.md` are history and are not updated. `pnpm -s spec:trace` enforces it in CI.

### V. Tenant Isolation

Every business table has a `tenant_id` column, and no repository reads or writes without filtering on it. The tenant comes from `RequestContext`, never from a request parameter. See `AGENTS.md` § "Principes non négociables", point 1.

### VI. Typed Business Errors

Every business error is a subclass of `AppError` with a stable code from a literal union. `throw new Error()` is forbidden outside `infra/` and bootstrap code. Conversion to HTTP (RFC 9457) happens only in `ProblemDetailsFilter`. See `AGENTS.md` § "Principes non négociables", point 2.

### VII. Secure by Default

Every route is authenticated by default; `@Public()` is the only explicit exception. Every route that changes data shared by the tenant declares its role (`@RequireRole`). Access to a resource is a business rule enforced in the use case, and a resource the caller may not see answers 404. See `AGENTS.md` § "Principes non négociables", point 3, and § "Autorisations".

### VIII. Bounded External Calls

Every Redis key has a TTL; every external call has a timeout, and goes through a queue when it is slow. See `AGENTS.md` § "Principes non négociables", point 4.

### IX. Generated, Backward-Compatible Migrations

Migrations are generated (`pnpm nx run api:db-generate --name=<topic>`), never edited by hand, and backward compatible (expand/contract), because old instances keep running while they apply. See `AGENTS.md` § "Principes non négociables", point 5, and § "Déploiement".

### X. Domain Boundaries

Each business domain is an Nx library under `libs/api/<domain>` and exposes only its facade from `src/index.ts`. A domain consumes another one through a port in `application/` and an adapter in `infra/` that delegates to the other facade. Each domain owns its Postgres schema, with no join or foreign key into another domain's tables. Asynchronous reactions go through versioned integration events (outbox), never through a synchronous call. `domain/` imports neither NestJS, Drizzle nor `pg`. See `AGENTS.md` § "Règles de frontières" and § "Événements d'intégration".

## Development Workflow

- Every change of observable behavior starts from a spec. Without a spec: refactoring, chores, documentation, dependencies, performance, and a fix that restores an already specified behavior; a bug that reveals an unspecified behavior adds its scenario to the spec, with its test.
- A feature lives in `specs/NNN-<name>/` (`spec.md`, `plan.md`, `tasks.md` and their companions), written in English.
- A feature is developed on its own branch, `NNN-<name>`, which `/speckit-specify` creates (`before_specify` hook of the git extension) from `dev`, and whose name is also the spec directory's.
- `/speckit-implement` and `/speckit-converge` run until converge reports **Converged**, which requires a test for every acceptance scenario and an independent review without open blocking finding.

## Governance

The convention files are changed first; this constitution follows when a principle changes (`/speckit-constitution`), with a version bump: MAJOR when a principle is removed or redefined, MINOR when one is added, PATCH for wording. The four principles of the Artefact CI base (I to IV) change only through a release of speckit-artefact. A plan that must violate a principle justifies it in its "Complexity Tracking" section, and the review decides.

**Version**: 3.0.0 | **Ratified**: 2026-10-22 | **Last Amended**: 2026-11-10
