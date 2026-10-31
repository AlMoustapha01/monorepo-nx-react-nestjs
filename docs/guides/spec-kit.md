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

## Index du produit

Quand le produit a un cahier des charges, `specs/product.yml` en liste les exigences, les regroupe en epics et déclare les parcours de bout en bout de chaque epic. Chaque spec nomme les exigences qu'elle implémente. On voit ainsi, d'une session à l'autre, ce qui reste à spécifier, dans quel ordre, et où en est chaque exigence et chaque epic.

```yaml
# specs/product.yml : appartient au produit.
# Un identifiant ne se renumérote jamais : on le retire (retired: <raison>).
requirements:
  - id: ACC-01
    title: Créer un compte et une organisation
  - id: PAY-03
    title: Payer par mobile money
  - id: PAY-04
    title: Rembourser une commande
  - id: PAY-01
    title: Payer en espèces à la livraison
    retired: Remplacée par PAY-03

epics:
  - id: E01
    title: Accès
    goal: Un commerçant ouvre sa boutique sans aide.
    requirements: [ACC-01]
  - id: E03
    title: Paiement
    goal: Un client paie et se fait rembourser sans contacter le support.
    requirements: [PAY-03, PAY-04, PAY-01]
    depends_on: [E01]
    journeys:
      - id: E03-J1
        title: Payer puis se faire rembourser
        steps: [s'inscrire, commander, payer par mobile money, demander le remboursement]
```

- **Exigences** : identifiant `<PRÉFIXE>-<numéro>`, celui du cahier des charges, et un titre court. L'index appartient au produit : `/speckit-specify` le lit, ne le modifie pas.
- **Epics** (optionnels) : identifiant `E<numéro>`, un objectif, les exigences qu'il regroupe, et `depends_on`, les epics à terminer avant. Dès qu'un epic existe, toute exigence active appartient à exactement un epic. Un petit produit peut s'en passer : sans `epics`, l'index reste une liste d'exigences.
- **Parcours** : un parcours traverse plusieurs fonctionnalités (`E03-J1`), et un test de bout en bout le cite en tête de titre, comme un scénario : `test('E03-J1: pays then gets refunded', …)`. Il va d'ordinaire dans `apps/web-e2e`.
- **Retrait** : `retired: <raison>` sur une exigence ou un parcours. Son identifiant reste pris ; une exigence retirée n'a plus besoin d'epic, et aucun test ne cite plus un parcours retiré.
- En tête de spec, `**Product Requirements**: PAY-03, PAY-04`, ou `None` (fonctionnalité technique). `/speckit-specify` la remplit, et pose la question si plusieurs exigences peuvent correspondre.
- **Aucun état ne s'écrit à la main.** Celui d'une exigence se déduit de ses specs : « non spécifiée » sans spec, sinon le statut de la spec active la moins avancée (une v2 en `Draft` remet l'exigence en cours), `Retired` si toutes ses specs sont retirées ou si l'index la retire. Celui d'un epic est celui de son exigence la moins avancée, hors exigences retirées dans l'index (une exigence active dont toutes les specs sont retirées compte comme non spécifiée) ; il est terminé en `Implemented` ou `Shipped`. Ces états se calculent toujours sur toutes les specs, même quand `spec:trace` n'en vise qu'une. Comme `spec:trace` refuse une spec `Implemented` ou `Shipped` dont un scénario n'a pas de test, aucun agent ne peut déclarer une exigence ou un epic terminé sans ces tests.

`pnpm -s spec:trace` affiche les tableaux exigence → specs → état, epic → état et parcours → tests. Il échoue si :

- l'index est invalide : identifiant mal formé ou en double, epic qui cite une exigence inconnue, exigence dans deux epics ou dans aucun, dépendance vers un epic inconnu, dépendances circulaires (le cycle est nommé) ;
- une spec cite une exigence absente de l'index, ou l'index existe et une spec non retirée n'a pas la ligne `**Product Requirements**` ;
- un epic est terminé et l'un de ses parcours actifs n'a pas de test, ou un test cite un parcours absent ou retiré.

Il avertit, sans échouer, quand une spec en `Draft` avance sur un epic dont une dépendance n'est pas terminée, ou quand une spec active cite une exigence retirée. Une exigence sans spec n'est pas une erreur : c'est le travail qui reste. Sans index, rien ne change : la ligne vaut `None`.

L'ancien index `specs/product-requirements.json` n'est plus lu : `spec:trace` refuse de tourner tant qu'il existe. Ses exigences se recopient telles quelles sous `requirements:` dans `specs/product.yml`.

`tasks.md` et l'historique git font office de journal de progression : pas de `progress.md` ni de `feature_list.json` à tenir à côté.

## Branche et commits automatiques

`/speckit-specify` commence par créer la branche de la fonctionnalité et s'y placer : c'est le hook `before_specify` de l'extension `git` de Spec Kit (`.specify/extensions.yml`, skill `/speckit-git-feature`). Les règles ajoutées par le preset (`tools/spec-kit/preset/commands/speckit.specify.md`) :

- l'agent s'arrête si l'arbre a des modifications non commitées, et demande avant de partir d'une autre branche que `main` ;
- la branche se nomme `NNN-<nom>`, numérotée après les dossiers de `specs/` et toutes les branches locales et distantes : deux fonctionnalités en cours n'ont jamais le même numéro ;
- le dossier de la spec porte le même nom (`specs/NNN-<nom>`).

Ensuite, chaque commande qui écrit des fichiers commite son résultat sur cette branche : `specify`, `clarify`, `plan`, `tasks`, `checklist`, `analyze`, `implement`, `converge` et `constitution` (hooks `after_*`, skill `/speckit-git-commit`). L'agent rédige un message [Conventional Commits](https://www.conventionalcommits.org/) en anglais à partir de la diff (`docs(specs): add announcements spec`). Le commit prend tout l'arbre (`git add .`) : d'où l'arbre propre exigé au départ. `/speckit-analyze` ne modifie rien lui-même ; s'il est suivi de corrections (que vous avez acceptées), son hook les commite, et sans changement il ne fait rien.

Le reste se règle dans `.specify/extensions/git/git-config.yml` : format du nom de branche (préfixe, auteur), commandes qui commitent (`auto_commit`), style des messages (`commit_style: fixed` pour des messages fixes). L'extension propose d'autres hooks (initialisation du repo, commit avant chaque commande), volontairement absents de `.specify/extensions.yml` : `specify extension update git` les remet, il faut alors les retirer.

## Relecture indépendante

Un agent juge généreusement son propre travail. Avant de rendre une story, `/speckit-converge` la fait relire par un relecteur qui ne l'a pas écrite (preset, section « Independent Review ») :

- la grille, portable, est dans [`docs/agents/relecteur.md`](../agents/relecteur.md) ; l'adaptateur Claude Code est le sous-agent `.claude/agents/relecteur.md`, qui la lit ;
- le relecteur ne reçoit que la base (`origin/main`) et le dossier de la spec, jamais le résumé de l'auteur ;
- il ne signale que les écarts d'exigence, de correction et de principe, preuve à l'appui, et laisse ses doutes « à vérifier par un humain » ;
- chaque écart bloquant devient une tâche ajoutée à `tasks.md` ; un écart que l'agent conteste figure dans son rapport, avec la preuve, et reste ouvert : pas de « Converged » tant que vous n'avez pas tranché.

Avec un autre agent que Claude Code, `/speckit-converge` vous demande de lancer la relecture dans une nouvelle session (« applique docs/agents/relecteur.md à cette branche ») et d'en coller le rapport.

Quand le jugement du relecteur diverge du vôtre (trop sévère, ou il laisse passer un vrai problème), corrigez la grille plutôt que de passer outre : c'est elle qui fait foi d'une session à l'autre.

## Vérification de fin de tour

Dans Claude Code, le hook `Stop` de `.claude/settings.json` lance `tools/dev/stop-check.mts` à chaque fin de tour : format (`oxfmt --check`) des fichiers changés depuis `origin/main` (commits, modifications, nouveaux fichiers), puis `nx affected -t lint typecheck` sur ces fichiers et les fichiers supprimés : supprimer un fichier encore importé ailleurs fait échouer le typecheck du projet qui l'importe. Rien de changé : il ne fait rien. En échec, l'agent reprend la main avec l'erreur ; s'il échoue encore au tour suivant, vous êtes seulement averti, pour éviter une boucle.

- `STOP_CHECK=off` le désactive, par exemple quand une autre session modifie le même arbre : ses fichiers en cours feraient échouer la vérification.
- Il ne lance pas les tests (trop lents à chaque tour) : `/speckit-implement`, `pnpm check` et la CI s'en chargent.
- Le script tourne aussi sous Node 22 (`--experimental-strip-types`), au cas où le shell de Claude Code n'a pas fait `nvm use`.

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
