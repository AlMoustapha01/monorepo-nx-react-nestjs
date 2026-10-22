# Spec Kit : cycle de vie et maintenance

Le cycle de développement, la règle TDD et la traçabilité sont dans [`AGENTS.md`](../../AGENTS.md) § « Développer une fonctionnalité (Spec Kit) ». Ce guide détaille la vie d'une spec après son merge et la maintenance de Spec Kit (1.2.2).

## Garder une spec à jour

Une fois mergée, `spec.md` décrit le comportement actuel ; `plan.md` et `tasks.md` ne bougent plus (historique de la construction).

- Une PR qui change le comportement d'une fonctionnalité spécifiée modifie son `spec.md` dans la même PR : nouveau scénario au numéro suivant, scénario modifié sous le même ID si l'intention reste la même.
- Un scénario ne se supprime pas, il se retire : `2. **Retired** (replaced by 007-US1-AS3): …`. Son numéro reste pris et aucun test ne doit plus le citer. Une nouvelle spec qui contredit une ancienne nomme le scénario qu'elle remplace et le retire dans l'ancienne spec, dans la même PR.
- Un bug qui révèle un comportement non spécifié : on ajoute le scénario à la spec avec son test.

### Statut

`**Status**:` en tête de spec :

| Statut        | Quand                                                                | Posé par            |
| ------------- | -------------------------------------------------------------------- | ------------------- |
| `Draft`       | Pendant l'écriture et l'implémentation                               | `/speckit-specify`  |
| `Implemented` | Chaque scénario a son test                                           | `/speckit-converge` |
| `Shipped`     | Dans la PR qui supprime le feature flag (relire la spec à ce moment) | À la main           |
| `Retired`     | La fonctionnalité est retirée                                        | À la main           |

### Contrôles de `spec:trace`

`pnpm -s spec:trace` (dans `pnpm check` et en CI) échoue si :

- un scénario d'une spec `Implemented` ou `Shipped` n'a pas de test (en `Draft`, il est seulement signalé) ;
- un test cite un scénario absent ou retiré ;
- le statut est absent ou inconnu.

`pnpm -s spec:trace specs/<NNN-nom>` limite le contrôle à une spec, en mode strict. En CI, `--base` ajoute un avertissement (annotation de PR, sans échec) quand des tests qui citent une feature changent sans son `spec.md` : un renommage ne change pas le comportement, la revue tranche.

## Branche et commits automatiques

`/speckit-specify` commence par créer la branche de la fonctionnalité et s'y placer : c'est le hook `before_specify` de l'extension `git` de Spec Kit (`.specify/extensions.yml`, skill `/speckit-git-feature`). Les règles ajoutées par le preset (`tools/spec-kit/preset/commands/speckit.specify.md`) :

- l'agent s'arrête si l'arbre a des modifications non commitées, et demande avant de partir d'une autre branche que `main` ;
- la branche se nomme `NNN-<nom>`, numérotée après les dossiers de `specs/` et toutes les branches locales et distantes : deux fonctionnalités en cours n'ont jamais le même numéro ;
- le dossier de la spec porte le même nom (`specs/NNN-<nom>`).

Ensuite, chaque commande qui écrit des fichiers commite son résultat sur cette branche : `specify`, `clarify`, `plan`, `tasks`, `checklist`, `implement`, `converge` et `constitution` (hooks `after_*`, skill `/speckit-git-commit`). L'agent rédige un message [Conventional Commits](https://www.conventionalcommits.org/) en anglais à partir de la diff (`docs(specs): add announcements spec`). Le commit prend tout l'arbre (`git add .`) : d'où l'arbre propre exigé au départ. `/speckit-analyze` ne modifie rien et ne commite pas.

Le reste se règle dans `.specify/extensions/git/git-config.yml` : format du nom de branche (préfixe, auteur), commandes qui commitent (`auto_commit`), style des messages (`commit_style: fixed` pour des messages fixes). L'extension propose d'autres hooks (initialisation du repo, commit avant chaque commande), volontairement absents de `.specify/extensions.yml` : `specify extension update git` les remet, il faut alors les retirer.

## Personnaliser les templates ou les règles TDD

La source est `tools/spec-kit/preset/`. Après une modification :

```sh
uvx --from specify-cli==1.2.2 specify preset update boilerplate --dev tools/spec-kit/preset
```

Seule la date d'installation change dans `.specify/presets/.registry`. Ne jamais éditer `.specify/presets/` ni `.claude/skills/speckit-*` à la main : ils sont regénérés.

## Utiliser un autre agent

Copilot, Cursor, Codex, Gemini… : installer [`uv`](https://docs.astral.sh/uv/), puis :

```sh
uvx --from specify-cli==1.2.2 specify integration install <clé> --force
uvx --from specify-cli==1.2.2 specify integration use <clé>
```

Clés : `copilot`, `cursor-agent`, `codex`, `gemini`, `generic` (liste dans la doc de Spec Kit). Les règles du boilerplate s'appliquent aussi à cet agent.

- Ne pas utiliser `integration switch`, qui supprime l'intégration Claude Code.
- Ces changements restent locaux : ne pas commiter le dossier de l'agent (`.github/skills/`…) ni `.specify/integration.json`, `.specify/init-options.json`, `.specify/presets/.registry` et `.specify/integrations/`.
- `git checkout -- .specify/scripts` rend aux scripts leur bit exécutable, que l'installation retire.

## Mettre à jour Spec Kit

Renovate ne suit pas Spec Kit (`uv` requis) :

```sh
uvx --from specify-cli==<version> specify init --here --force --non-interactive --integration claude --script sh
uvx --from specify-cli==<version> specify preset update boilerplate --dev tools/spec-kit/preset
```

Puis remplacer `1.2.2` dans `AGENTS.md`, dans ce guide et dans `tools/spec-kit/preset/`. Vérifier avec `git diff` que la constitution est intacte et que `.claude/skills/speckit-{tasks,implement,converge}/SKILL.md` gardent leur section « (boilerplate) ».
