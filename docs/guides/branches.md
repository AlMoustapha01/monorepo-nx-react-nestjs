# Branches et releases

Deux branches longues :

| Branche | Rôle                                                                                        | Reçoit                                                           |
| ------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `dev`   | intégration, branche par défaut du dépôt : ce qui est mergé ici part à la prochaine release | les PR de fonctionnalités, de correctifs, de docs et de Renovate |
| `main`  | production : chaque commit de `main` est déployable                                         | les PR de release `dev` → `main` et les hotfix                   |

## Développer

Toute branche part de `dev` à jour et y revient par PR :

```sh
git switch dev && git pull --ff-only
git switch -c fix/<sujet>
```

`/speckit-specify`, `/speckit-prd` et `/speckit-epics` le font eux-mêmes : lancés depuis `main`, ils basculent d'abord sur `dev`. Le relecteur et le hook de fin de tour comparent avec `origin/dev`. En local, `nx affected` prend `--base=origin/dev` ([Intégration continue](ci.md#ce-que-compare-nx-affected)).

Comme `dev` est la branche par défaut, une PR la cible sans rien choisir, et Renovate y ouvre ses PR.

## Livrer une release

Une PR de `dev` vers `main`, fusionnée par **merge commit** (jamais squash ni rebase) : `main` et `dev` gardent alors un historique commun, et la release suivante ne contient que les nouveaux commits.

```sh
gh pr create --base main --head dev --title "release: <date ou version>"
```

La CI revérifie la PR contre `main`. Une fois mergée, le déploiement suit [Déployer](deployer.md).
<!-- option:feature-flags:start -->

Une fonctionnalité inachevée peut partir en production : elle reste derrière son feature flag, coupé par défaut (principe 6).

<!-- option:feature-flags:end -->

## Corriger la production (hotfix)

Quand la correction ne peut pas attendre la prochaine release :

1. une branche `hotfix/<sujet>` depuis `main`, une PR vers `main` ;
2. après le merge, reporter `main` sur `dev` par une PR `main` → `dev` (merge commit), pour que la release suivante ne réintroduise pas le bug.

## Configuration GitHub

Une fois par dépôt (Settings → General et Settings → Branches, ou Rules) :

- branche par défaut : `dev` ;
- protection de `dev` et de `main` : checks exigés comme décrit dans [Intégration continue](ci.md#rendre-les-vérifications-obligatoires) ;
- sur `main`, merge commit seulement.
