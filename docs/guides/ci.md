# Intégration continue

Ce que vérifie la CI, comment reproduire un échec en local, et comment la faire évoluer. Les workflows sont dans `.github/workflows/` : `ci.yml` pour chaque PR et chaque push sur `dev` ou `main` ([Branches et releases](branches.md)), `audit.yml` pour les failles de dépendances ([Dépendances et failles](dependances.md)).

## Les jobs de `ci.yml`

Les quatre jobs tournent en parallèle, chacun sur un runner Ubuntu neuf.

| Job              | Vérifie                                                                          | Reproduire en local                                         |
| ---------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `check`          | format, lint, types, tests et build des projets affectés, scripts, specs, knip   | `pnpm check` (voir [plus bas](#check) pour les différences) |
| `e2e`            | parcours navigateur contre la vraie stack, si le front, l'API ou l'auth changent | `pnpm nx run web-e2e:e2e`                                   |
| `create-project` | le projet passe encore `pnpm check` une fois chaque option retirée               | dans un worktree à part, voir [plus bas](#create-project)   |
| `image`          | les images de production de l'API et du service d'auth se construisent           | `docker build .` et `docker build --build-arg APP=auth .`   |

Docker est disponible sur les runners : les tests d'intégration et e2e y démarrent Postgres, Redis et Mailpit par Testcontainers, comme en local.

### `check`

| Étape                              | Commande en CI                                                               | En local                                       |
| ---------------------------------- | ---------------------------------------------------------------------------- | ---------------------------------------------- |
| Format                             | `pnpm format:check`                                                          | `pnpm format` corrige                          |
| Lint, types, tests, build          | `pnpm nx affected -t lint typecheck test build i18n-check size --parallel=3` | la même, avec `--base=origin/dev`              |
| Scripts de dev                     | `pnpm typecheck:tools && pnpm test:tools`                                    | la même                                        |
| Specs à jour                       | `pnpm -s spec:trace --base "$NX_BASE"`                                       | `pnpm -s spec:trace` ([Spec Kit](spec-kit.md)) |
| Codes d'erreur documentés          | `pnpm -s docs:errors --check`                                                | `pnpm docs:errors` régénère la page            |
| Code mort, dépendances inutilisées | `pnpm knip`                                                                  | la même                                        |

`pnpm check` enchaîne presque les mêmes étapes, avec deux différences :

- il lance lint, types et tests sur **tous** les projets, pas seulement les affectés : plus lent, mais il ne dépend pas d'une base de comparaison ;
- il ne lance ni `build`, ni `i18n-check` (catalogues de traduction à jour, [lib feature du front](../reference/feature-web.md)), ni `size` (budget du JS initial du front, `apps/web/.size-limit.mts`). Une PR qui touche au front ou ajoute une dépendance lourde gagne à lancer la commande `nx affected` complète.

### `e2e`

Le job demande à Nx si un projet qui a une cible `e2e` est affecté (aujourd'hui `web-e2e`, qui dépend de `web`, `api` et `auth`). Sinon, il s'arrête après l'installation, en succès.

Sinon il installe Chromium et lance `pnpm nx affected -t e2e`. En CI, Playwright réessaie une fois un test en échec (`retries: 1`) et refuse un `test.only` oublié.

**Lire un échec** : la page du run, en bas, propose l'artefact `playwright` (gardé 7 jours). Une fois décompressé :

| Dossier    | Contenu                                                                  | Ouvrir                                        |
| ---------- | ------------------------------------------------------------------------ | --------------------------------------------- |
| `report/`  | rapport HTML de tous les tests                                           | `pnpm exec playwright show-report report`     |
| `results/` | pour chaque test en échec, sa trace (`trace.zip`) et une capture d'écran | `pnpm exec playwright show-trace <trace.zip>` |
| `logs/`    | sortie de chaque service : `api.log`, `auth.log`, migrations, build      | un éditeur                                    |

La trace rejoue le test étape par étape, avec le DOM, la console et les requêtes réseau de chaque étape ([Trace viewer](https://playwright.dev/docs/trace-viewer)). Une erreur 500 se lit ensuite dans `logs/api.log`.

En local, le même dossier est écrit sous `dist/.playwright/apps/web-e2e/` (sans le rapport HTML, réservé à la CI).

### `create-project`

Une matrice de quatre variantes : `no-examples` (`--no-examples`), `no-sentry` (`--no-sentry`), `no-feature-flags` (`--no-examples --no-feature-flags`, les flags ne partent qu'avec les exemples) et `minimal` (`--name acme --no-examples --no-sentry --no-feature-flags`). Chacune lance `pnpm create:project --yes <options>` puis `pnpm check` sur tout le repo, sans `affected`. Elle échoue quand un marqueur est mal formé, ou quand le code d'une option a fui hors de ses fichiers et de ses marqueurs : le code restant ne compile plus, ou ses tests échouent (un import vers un domaine d'exemple depuis du code générique, un nouveau fichier oublié dans les `paths` de l'option). Les mentions restantes (un commentaire, une doc) sont listées dans la sortie du script, sans faire échouer le job ([Démarrer un projet](demarrer-un-projet.md)). Une nouvelle option ajoute sa variante : chaque option seule, plus le minimum, pas toutes les combinaisons.

Pour le reproduire sans toucher à sa copie de travail (le script modifie l'arbre et exige qu'il soit propre) :

```bash
git worktree add ../create-test HEAD
cd ../create-test
pnpm install
pnpm create:project --yes --no-sentry && pnpm check
cd - && git worktree remove --force ../create-test
```

### `image`

Construit les deux images comme en production, sans les publier. Il échoue quand le build webpack casse, ou qu'une dépendance runtime manque dans l'image (voir les pièges du build dans [`AGENTS.md`](../../AGENTS.md#pièges-connus)). Pour lancer la stack de production complète en local : [Déployer](deployer.md).

## Ce que compare `nx affected`

Un projet est **affecté** si un de ses fichiers a changé entre deux commits, ou un projet dont il dépend. Une dépendance mise à jour dans le lockfile affecte les projets qui l'utilisent ; un changement de `nx.json` affecte tout.

Les deux commits viennent de l'action `nx-set-shas` (variables `NX_BASE` et `NX_HEAD`) :

- sur une PR : le point de départ de la branche sur la branche ciblée (`dev`, ou `main` pour une release ou un hotfix), et le dernier commit de la PR ;
- sur un push sur `dev` ou `main` : le dernier commit de cette branche dont la CI est passée, et le nouveau (`main-branch-name: ${{ github.ref_name }}`). Si un push casse la branche, le suivant revérifie aussi ses changements.

D'où le `fetch-depth: 0` du checkout : sans l'historique complet, Nx ne trouve pas la base.

En local, `nx affected` compare à la branche `main` locale (`defaultBase` de `nx.json`). Une branche partie de `dev` y trouverait tout ce qui n'est pas encore en production : `git fetch`, puis `--base=origin/dev`.

## Conventions du workflow

- **Actions épinglées par SHA**, avec la version en commentaire (`@3d3c42e… # v7.0.1`) : un tag peut être déplacé vers un autre code, un commit non. Renovate met à jour le SHA et le commentaire ensemble.
- **Permissions minimales** : lecture du code, et des runs précédents pour `nx-set-shas`. `persist-credentials: false` : le token du checkout n'est pas laissé sur le disque pour les étapes suivantes.
- **Un nouveau push annule le run précédent** de la même PR (`concurrency`). Sur `main`, chaque commit est vérifié jusqu'au bout.
- **Timeouts** : 30 min pour `check`, `e2e` et chaque variante de `create-project`, 20 min pour `image`. Un job qui les atteint est bloqué (souvent un conteneur qui ne démarre pas), pas lent.
- Node et pnpm viennent du repo (`.nvmrc`, `packageManager`) : la CI ne déclare aucune version à elle.

## Faire évoluer la CI

- **Nouvelle vérification d'un projet** (un outil qui tourne par lib) : en faire une cible Nx dans son `project.json`. `nx affected -t <cible>` dans le job `check` la lance seulement quand c'est utile ; l'ajouter aussi à `pnpm check` si elle doit tourner avant chaque PR.
- **Nouvelle vérification globale** (un script de `tools/dev`) : un script `pnpm`, une étape dans `check` commentée comme les autres, et le même script dans `pnpm check`, pour qu'un passage en local suffise. Le script a ses tests dans `tools/dev/*.test.mts`.
- **Nouvelle action** : l'épingler par SHA (`gh api repos/<owner>/<repo>/commits/<tag> --jq .sha`), avec la version en commentaire.
- **Nouveau projet e2e** : une cible `e2e` suffit, le job la trouve.

## Rendre les vérifications obligatoires

Rien n'empêche aujourd'hui de merger une PR en échec : la protection des branches `dev` et `main` est à configurer sur GitHub (Settings → Branches, ou Rules), une fois par dépôt :

- exiger les checks `check`, `e2e`, les quatre `create-project (…)` et `image` ; `e2e` peut l'être, il réussit quand il n'a rien à lancer ;
- ne pas exiger `audit` : il ne tourne que si les dépendances changent, et un check exigé qui ne tourne pas bloque la PR ;
- exiger la revue des propriétaires de code (« Require review from Code Owners ») pour les chemins sensibles de [`.github/CODEOWNERS`](../../.github/CODEOWNERS), **seulement à partir de deux mainteneurs** : GitHub ne compte pas l'approbation de l'auteur d'une PR, un mainteneur seul ne pourrait plus merger ses propres PR. D'ici là, CODEOWNERS sert de liste : le relecteur la cite, et la revue humaine reste une règle d'équipe ;
- sur `main`, n'autoriser que le merge commit, pour que `dev` et `main` gardent un historique commun ([Branches et releases](branches.md)) ;
- en option, exiger une branche à jour avec sa cible avant le merge : deux PR vertes chacune peuvent casser `dev` une fois réunies, mais chaque merge oblige alors à remettre les autres PR à jour.

Référence : [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) (GitHub).

## Pour apprendre

[Notions et ressources](../notions.md#qualité-et-ci) : GitHub Actions, Nx affected, Playwright, Testcontainers.
