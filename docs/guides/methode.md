# Méthode : développer avec des agents de code

Ce guide place les phases d'un cycle de développement assisté par agents (initialiser, spécifier, prototyper, planifier, construire, vérifier, intégrer, jardiner) sur ce que fournit le dépôt. Les règles qui font foi sont dans [`AGENTS.md`](../../AGENTS.md) ; ce guide n'en ajoute pas, il donne des recommandations. Le cycle Spec Kit pas à pas est dans [Votre première fonctionnalité](../tutorial/premiere-fonctionnalite.md).

Quatre principes traversent les phases. Les deux premiers sont des règles d'`AGENTS.md`, appliquées par l'outillage ; les deux suivants sont des recommandations, que rien ne vérifie :

- celui qui produit ne valide pas : un relecteur indépendant, puis un humain sur les chemins sensibles ;
- toute tâche a un critère de fin vérifiable par une commande (`pnpm check`, `pnpm -s spec:trace`, un test) ;
- une session traite une user story ; après deux corrections ratées, on repart d'une session neuve, qui reprend depuis `tasks.md` et l'historique git ;
- une erreur constatée deux fois devient une règle mécanique : test, lint, hook ou ligne de la grille du relecteur.

## Les phases dans le dépôt

| Phase       | Dans ce dépôt                                                                                                                                                               | Critère de sortie                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Initialiser | `pnpm install`, `pnpm init:project`, `pnpm strip:examples`, `pnpm dev:setup`, index du produit, design system (`libs/web/ui`) : [Démarrer un projet](demarrer-un-projet.md) | Un agent neuf lance `pnpm check` et `pnpm nx run web-e2e:e2e` au vert, sans aide            |
| Spécifier   | `/speckit-specify`, puis `/speckit-clarify` : `specs/NNN-<nom>/spec.md`, exigences du produit en tête                                                                       | Plus de `[NEEDS CLARIFICATION]` ; chaque scénario se vérifie par un test                    |
| Prototyper  | Écrans à fort enjeu seulement, entre `/speckit-clarify` et `/speckit-plan` : `specs/NNN-<nom>/prototypes/`                                                                  | Le prototype est validé par des utilisateurs ; ses critères sont dans la spec               |
| Planifier   | `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze` : `plan.md` (fichiers, interfaces, stratégie de test), `tasks.md`                                                     | `/speckit-analyze` ne signale plus d'incohérence ; chaque story tient dans une PR relisible |
| Construire  | `/speckit-implement` : tests vus en échec, puis code ; commit par commande ; hook de fin de tour (format, lint, types)                                                      | `pnpm nx affected -t lint typecheck test e2e` au vert à la fin de la story                  |
| Vérifier    | `/speckit-converge` : `spec:trace`, puis le [relecteur indépendant](spec-kit.md#relecture-indépendante)                                                                     | « Converged » : aucun manque, aucun écart bloquant ouvert                                   |
| Intégrer    | PR d'une user story, [CI](ci.md), relecture humaine des chemins de [`.github/CODEOWNERS`](../../.github/CODEOWNERS)                                                         | CI au vert, PR mergée                                                                       |
| Jardiner    | Specs tenues à jour ([cycle de vie](spec-kit.md#garder-une-spec-à-jour)), grille du relecteur ajustée, Renovate                                                             | `spec:trace` au vert sur `main` ; aucune doc périmée connue                                 |

## Connaissance, contrôle, mémoire

- **Connaissance** (ce que l'agent doit savoir) : `AGENTS.md` (règles), `docs/` (procédures, architecture, ADR), `specs/` (comportement voulu), la constitution de Spec Kit (`.specify/memory/constitution.md`, résumé d'`AGENTS.md`).
- **Contrôle** (ce qui vérifie l'agent sans le croire sur parole) : `pnpm check` et la CI, `spec:trace`, le hook `Stop`, le relecteur indépendant, `CODEOWNERS`.
- **Mémoire** (ce qui survit d'une session à l'autre) : `tasks.md` (cases cochées), les commits de chaque commande Spec Kit et l'[index du produit](spec-kit.md#index-du-produit) (exigences et epics), dont l'état se déduit des specs. Il n'y a ni `progress.md` ni `feature_list.json` : ils doubleraient `tasks.md` et l'index, et pourraient les contredire.

## Choix propres à ce dépôt

- **Un seul dossier par fonctionnalité.** `specs/NNN-<nom>/` porte la spec, le plan, les tâches et les prototypes. Pas de `docs/product-specs/` ni de `docs/exec-plans/` à côté : il y aurait deux sources de vérité.
- **La spec dit le quoi, le plan dit le comment.** Les fichiers, interfaces, domaines, migrations et la stratégie de test vont dans `plan.md`, jamais dans `spec.md`, qui doit rester juste quand le code change de forme.
- **Une user story par PR** (règle d'`AGENTS.md`). Recommandation : une story qu'on ne relirait pas en un quart d'heure se découpe dès `/speckit-specify` en plusieurs stories, chacune livrable seule. Une story longue s'implémente en plusieurs sessions : la suivante reprend depuis `tasks.md`.
- **Critères jugés par un humain.** « 4 utilisateurs sur 5 trouvent l'écran en moins de 3 minutes » ou « lisible au soleil sur un téléphone d'entrée de gamme » ne deviennent pas des tests. Ils vont dans les _Success Criteria_ (`SC-xxx`) de la spec, pas dans les scénarios d'acceptation : `spec:trace` exigerait un test et bloquerait la spec en `Draft`.
- **Prototypes.** Parcours, wireframes et captures du prototype de référence vont dans `specs/NNN-<nom>/prototypes/`, nommés par écran (`checkout-mobile.png`). Citez-les dans le plan. La comparaison des écrans livrés à ces captures reste humaine : ni le preset ni le relecteur ne l'outillent (voir plus bas). Un prototype est un contrat visuel, pas du code : le code suit le cycle normal.
- **Ce qui passe sans spec** : voir `AGENTS.md` (« Sans spec ») ; en bref, ce qui ne change aucun comportement observable, et le `fix` qui rétablit un comportement déjà spécifié.

## Pas encore dans le dépôt

- **Isolation des agents** : pas de conteneur de développement ni de liste blanche réseau. Les agents tournent avec les droits de votre session : pas de clé de production dans `.env`, et les permissions de Claude Code restent votre garde-fou.
- **Régression visuelle** : pas de comparaison automatique au prototype, pas de `toHaveScreenshot` dans les parcours Playwright, ni de lint qui interdit les couleurs et tailles codées en dur hors du thème.
- **Jardinage automatique** : pas de tâche de fond qui cherche la doc périmée ou les écarts aux principes ; cela se fait en revue.
