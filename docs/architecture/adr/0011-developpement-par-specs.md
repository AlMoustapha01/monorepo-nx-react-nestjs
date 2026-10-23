# 0011. Développement par specs (Spec Kit), en TDD, avec traçabilité

- **Statut** : Acceptée
- **Date** : 2026-10-22

## Contexte

Les projets issus du boilerplate sont développés en grande partie avec des agents de code. Sans cadre, une fonctionnalité part d'une description floue, ses tests suivent le code au lieu de le précéder, et plus personne ne sait quel comportement est voulu. Il faut une trace écrite du comportement attendu, et la preuve que chaque scénario est testé.

## Décision

- Toute fonctionnalité part d'une spec Spec Kit (`specs/NNN-<nom>/`) : spec (le quoi, sans technique), clarification, plan, tâches, implémentation, convergence. Specs, plans et tâches en anglais ; une user story par PR.
- Les tâches de test précèdent le code et sont vues en échec avant d'être cochées.
- Chaque scénario d'acceptation a un identifiant (`003-US1-AS2`) que citent les titres des tests qui le couvrent ; `pnpm -s spec:trace` en tire la matrice et échoue sur un scénario sans test ou un test qui cite un scénario inconnu. Il tourne en CI.
- Une spec mergée décrit le comportement actuel : une PR qui le change modifie la spec.
- Les personnalisations de Spec Kit vivent dans un preset versionné (`tools/spec-kit/preset/`), pour survivre aux mises à jour.

## Conséquences

- Le comportement voulu est écrit, relu et versionné à côté du code.
- La matrice prouve qu'un test cite chaque scénario, pas qu'il le vérifie bien : la relecture des tests reste nécessaire.
- Un coût fixe par fonctionnalité, même petite.

## Alternatives écartées

Une garde en CI « PR `feat` ⇒ spec » a été envisagée puis écartée : l'usage de Spec Kit repose sur la documentation et l'outillage. Elle pourra revenir ([conception](../../archive/specs/2026-10-22-spec-kit-design.md)).
