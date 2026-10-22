# Spec Kit : développement piloté par les specs pour les projets issus du boilerplate

Date : 2026-10-22

## Intention

Ce repo est un boilerplate : on le clone pour démarrer son propre produit. On veut qu'un projet qui en part développe ses fonctionnalités avec [Spec Kit](https://github.com/github/spec-kit) (spec → plan → tâches → implémentation), **sans rien installer ni configurer** au départ, et que les plans produits par l'agent respectent l'architecture du boilerplate (domaines, tenant, outbox, feature flags, PR < 500 lignes) au lieu de l'ignorer.

Exigences du porteur :

1. **Prêt dès le clone**, au minimum pour Claude Code ; la procédure pour un autre agent est documentée.
2. **TDD** : les templates et l'agent imposent l'écriture des tests en premier. La CI ne le vérifie pas.
3. **Pas de garde CI pour l'instant** : l'usage de Spec Kit repose sur la documentation et l'outillage, sans contrôle en CI. Une garde « PR `feat` ⇒ spec » a été envisagée puis écartée ; elle pourra revenir plus tard.

Les specs, plans et tâches sont rédigés **en anglais**.

## Objectifs

1. Spec Kit installé et commité dans le repo, intégration Claude Code (skills `/speckit-*` dans `.claude/skills/`).
2. Une constitution propre au boilerplate.
3. Des templates adaptés au boilerplate et au TDD.
4. Des commandes `implement` et `converge` qui suivent le cycle TDD.
5. La documentation du processus dans `AGENTS.md` et le README, y compris pour un autre agent.

## Non-objectifs

- Écrire des specs pour le code existant (`catalog`, `orders`, `notifications`, front) : ce sont des exemples de référence, pas des fonctionnalités à spécifier.
- Toute vérification en CI : ni présence d'une spec pour une PR de fonctionnalité, ni TDD, ni contenu des specs. `ci.yml` n'est pas modifié.
- Installer d'autres intégrations que Claude Code dans le repo.
- Les extensions optionnelles de Spec Kit (bug, assess, git…).

## Anti-objectifs

- **Deux sources de vérité** : la constitution ne recopie pas `AGENTS.md` règle par règle. Si une règle change dans `AGENTS.md`, la constitution ne doit pas devenir fausse.
- **Des personnalisations perdues à la mise à jour de Spec Kit** : elles doivent survivre à une mise à jour de Spec Kit (voir « Mises à jour »).
- **Exiger Python ou `uv` pour travailler au quotidien** avec Claude Code : seulement pour changer d'agent ou mettre à jour Spec Kit.

## Ce que génère Spec Kit (constaté avec la 1.2.2)

`specify init --integration claude --script sh` produit :

```
.claude/skills/speckit-{constitution,specify,clarify,plan,checklist,tasks,analyze,implement,converge,taskstoissues}/SKILL.md
.specify/
  .gitignore                 état local (feature.json…), déjà ignoré
  init-options.json, integration.json, integrations/*.manifest.json
  memory/constitution.md     (+ .constitution-template.json)
  scripts/bash/*.sh          create-new-feature, setup-plan, setup-tasks, check-prerequisites…
  templates/{spec,plan,tasks,checklist,constitution}-template.md
  workflows/
```

Chaque fonctionnalité vit dans `specs/NNN-<nom>/` à la racine (`spec.md`, `plan.md`, `tasks.md`, plus `research.md`, `data-model.md`, `contracts/`, `quickstart.md`, `checklists/` selon les étapes). La numérotation est séquentielle. Les branches numérotées viennent d'une extension optionnelle `git`, non retenue : rien ici ne dépend du nom de branche.

Résolution des templates : `.specify/templates/overrides/` > presets > extensions > templates de base. Les **commandes** (skills) ne sont pas résolues à l'exécution : un preset ou une extension les recopie dans `.claude/skills/` à l'installation.

## Décisions

### 1. Installation

- Spec Kit **épinglé** (1.2.2, ou la dernière version publiée au moment de l'implémentation), installé avec `uvx --from specify-cli==<version> specify init --here --integration claude --script sh` à la racine du repo, et le résultat commité.
- Fichiers commités : `.specify/` (sauf ce que son `.gitignore` exclut), `.claude/skills/speckit-*`. Le dossier `specs/` n'existe pas encore : le premier `/speckit-specify` le crée.
- `/speckit-taskstoissues` reste installé (fourni par défaut), sans être mis en avant dans la doc.
- Les fichiers générés doivent passer `pnpm format:check` et `pnpm knip` : exclure `.specify/` et `specs/` du formatage s'il les réécrit (à constater), ne rien ajouter qui fasse réagir knip.

### 2. Constitution (`.specify/memory/constitution.md`)

En anglais. Elle énonce brièvement chaque principe non négociable et renvoie à `AGENTS.md` (section précise) pour le détail, qui fait foi en cas d'écart. Contenu :

- les six principes non négociables d'`AGENTS.md` (tenant, `AppError`, auth par défaut, TTL et timeouts, migrations générées et rétrocompatibles, feature flag + PR < 500 lignes) ;
- les règles de frontières entre domaines (façades, ports/adapters, schéma Postgres par domaine, événements d'intégration plutôt qu'appel synchrone pour les réactions) ;
- un principe **Test-First** : aucun code de production sans un test qui a d'abord échoué ; niveaux de test d'`AGENTS.md` (unitaires sur `domain/` et `application/` avec fakes en mémoire, intégration sur vrai Postgres, e2e via `configureApp` + supertest, parcours navigateur Playwright pour le front) ;
- gouvernance : modifier `AGENTS.md` d'abord, puis la constitution si un principe change ; un plan qui viole un principe le justifie dans « Complexity Tracking ».

Elle est rédigée pour le boilerplate, donc vraie pour tout projet qui en part. Un projet peut la réviser avec `/speckit-constitution`.

### 3. Templates (surcharges dans `.specify/templates/overrides/`)

- **spec** : template de base conservé. Ajout seulement d'une consigne : chaque scénario Given/When/Then doit être vérifiable par un test automatisé.
- **plan** : « Technical Context » et « Project Structure » pré-remplis avec la stack et l'arborescence du boilerplate (Nx, `libs/api/<domaine>/{domain,application,infra,http}`, `libs/shared/contracts`, `apps/web`, `libs/web/*`). Sections obligatoires : domaine(s) touché(s) ou créé(s) ; feature flag (nom, défaut désactivé, `client` ou non) ; événements d'intégration publiés ou consommés (nom versionné, payload) ; migrations (générées, expand/contract) ; rôles et règles d'accès ; **stratégie de test** : pour chaque scénario d'acceptation de la spec, le niveau de test et le fichier visé. « Constitution Check » renvoie aux principes de la constitution.
- **tasks** : les tests ne sont plus optionnels. Pour chaque user story, les tâches suivent le cycle rouge → vert → refactor : tâche de test (écrire, lancer, constater l'échec pour la bonne raison), puis tâche d'implémentation minimale, puis refactor si besoin. Chemins d'exemple et commandes adaptés au repo (`*.spec.ts`, `*.int.spec.ts`, `apps/api/tests`, `apps/web-e2e`, `pnpm nx test <projet>`). Une user story est découpée pour tenir dans une PR de moins de 500 lignes ; sinon, la diviser.

### 4. Commandes `implement` et `converge`

- **`/speckit-implement`** : une tâche de test n'est cochée qu'après avoir lancé le test et constaté son échec ; une tâche d'implémentation qu'après le passage de ses tests et de `pnpm nx affected -t lint typecheck test`. Pas de code de production avant son test.
- **`/speckit-converge`** : un scénario d'acceptation sans test qui le couvre est un écart ; il ajoute la tâche de test manquante.
- **Mécanisme** : ces changements doivent survivre à une mise à jour de Spec Kit. Préférence : un **preset local** versionné dans le repo (par exemple `.specify/presets/boilerplate/`, ou l'emplacement prévu par Spec Kit), qui surcharge ces deux commandes et porte aussi les templates du point 3 si c'est plus simple que les overrides. À défaut, des hooks `before_implement` / `after_implement` (`.specify/extensions.yml`). En dernier recours seulement, éditer `.claude/skills/speckit-*/SKILL.md`, avec la procédure pour réappliquer la modification documentée dans `AGENTS.md`. Le choix entre ces options revient à l'implémenteur, selon ce que permet la version de Spec Kit retenue.

### 5. Documentation

- **`AGENTS.md`** (en français, comme le reste) : une section « Développer une fonctionnalité (Spec Kit) » avec le cycle `/speckit-specify` → `/speckit-clarify` → `/speckit-plan` → `/speckit-tasks` → `/speckit-analyze` → `/speckit-implement` ↔ `/speckit-converge`, une user story par PR, specs en anglais, TDD, et où sont la constitution et les surcharges. Ajouter `specs/` et `.specify/` à « Structure ». Ajouter au tableau des commandes la mise à jour de Spec Kit.
- **Autre agent** : installer `uv`, puis `specify integration install <clé>` (`copilot`, `cursor-agent`, `codex`, `gemini`, `generic`…) et `specify integration use <clé>`. Le preset local et les surcharges s'appliquent aussi : vérifier que les commandes surchargées du point 4 sont bien installées pour cet agent. Préciser ce qui est commité et ce qui reste local.
- **README** : un paragraphe court qui renvoie à `AGENTS.md`.

### 6. Mises à jour de Spec Kit

Renovate ne suit pas Spec Kit. Documenter dans `AGENTS.md` la procédure : la commande de mise à jour de la CLI pour la version cible, puis vérifier que la constitution, les surcharges et les commandes personnalisées sont intactes (`git diff`), et lancer `/speckit-analyze` sur une spec existante si besoin.

## Contraintes

- Principe 6 d'`AGENTS.md` : cette PR est de l'outillage, pas une fonctionnalité métier, donc pas de feature flag. Elle doit rester sous 500 lignes **hors fichiers générés par Spec Kit**. Si ce n'est pas possible, découper : (1) installation + constitution + templates, (2) commandes TDD + doc.
- `pnpm check` doit passer.
- Commits en anglais, commits conventionnels.
- Un autre agent travaille en parallèle sur le front dans ce même working tree : ne stager que ses propres fichiers.

## Laissé à l'implémenteur

- Le mécanisme exact des commandes TDD (point 4), dans l'ordre de préférence donné.
- La formulation de la constitution et des templates, dans le respect du contenu décrit.
- L'exclusion éventuelle de `.specify/` et `specs/` du formatage et de knip.