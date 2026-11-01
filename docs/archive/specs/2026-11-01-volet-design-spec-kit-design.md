# Volet produit, UX et design dans Spec Kit

Date : 2026-11-01. Statut : à valider. Révisé après relecture à froid : maquettes en HTML/CSS, périmètre du cadrage sur le code.

## Intention

Aujourd'hui, le cycle Spec Kit passe de la spec (le quoi, sans technique) au plan technique, puis au code. Personne ne regarde les parcours ni les écrans avant `/speckit-implement` : ils s'inventent au fil du code. `docs/guides/methode.md` nomme déjà une phase « Prototyper » (entre `/speckit-clarify` et `/speckit-plan`, dans `specs/NNN-<nom>/prototypes/`), mais aucune commande ne la porte : c'est une recommandation que rien ne déclenche.

On ajoute deux étages, chacun avec sa commande :

1. **Produit**, une fois au départ puis à chaque révision : un cadrage design qui fixe les utilisateurs et leurs contextes d'usage, les principes d'ergonomie, le ton, l'accessibilité visée et la direction visuelle, et qui **change réellement le thème de l'app** (`libs/web/ui`). Tous les prototypes et tous les écrans livrés en héritent.
2. **Fonctionnalité**, à la demande, sur les fonctionnalités que l'utilisateur juge importantes : des parcours utilisateur écrits, puis une maquette cliquable qui les suit, avec le vrai rendu de l'app. L'utilisateur juge l'enchaînement **et** le rendu visuel (couleurs, mise en page, mobile) avant le plan technique.

Comme pour le PRD et les epics : l'agent propose, l'humain tranche, rien n'est écrit avant son accord.

## Objectifs

- Valider parcours et écrans avant d'écrire du code, sur les fonctionnalités qui le méritent.
- Un style cohérent d'une fonctionnalité à l'autre, décidé une fois au niveau du produit, appliqué par le thème plutôt que par la discipline de chacun.
- Des captures d'écran par écran (desktop et mobile) qui servent de contrat visuel au plan et à l'implémentation.

## Non-objectifs

- Rendre le prototypage obligatoire : il reste réservé aux fonctionnalités que l'utilisateur choisit.
- Figma, Claude Design ou un autre outil externe : les maquettes vivent dans le repo (un seul dossier par fonctionnalité), utilisables par tout agent ou humain. Un outil externe reste possible ponctuellement, pour faire tester une maquette, hors du cycle.
- La régression visuelle automatique (comparaison des écrans livrés aux captures, `toHaveScreenshot`) : reste listée dans « Pas encore dans le dépôt » de `methode.md`.
- Outiller les tests utilisateurs : `methode.md` les recommande, rien ne change ici.

## Anti-objectifs (échec même si ça marche)

- Du code de prototype qui fuit dans le code livré, ou qu'on « garde » au lieu de suivre le cycle TDD.
- Le prototype qui devient une seconde source de vérité face à la spec : un comportement découvert en cliquant remonte dans `spec.md`, il ne vit pas seulement dans la maquette.
- Chaque prototype qui réinvente son style au lieu d'hériter du cadrage produit.
- Une étape qui bloque ou alourdit les fonctionnalités sans enjeu d'écran.

## Contraintes

- Les commandes Spec Kit se sources dans `tools/spec-kit/preset/` (`preset.yml`, `commands/`, `templates/`), puis se réinstallent ; on n'édite jamais `.specify/presets/` ni `.claude/skills/speckit-*` (AGENTS.md).
- Specs, plans, tâches, et donc les documents produits par ces commandes, en anglais. Le guide et AGENTS.md en français.
- Chaque commande qui écrit des fichiers commite son résultat (Conventional Commits, anglais), comme les autres commandes du preset.
- `libs/web/ui` reste purement visuel, sans chaîne en dur, exporté par `index.ts` (lint) ; le thème vit dans `libs/web/ui/src/lib/styles/theme.css` (tokens shadcn en OKLCH, clair et sombre).
- `pnpm check` (format, lint, types, tests, knip) et `pnpm -s spec:trace` doivent rester verts, y compris avec des prototypes présents dans `specs/`, et après `pnpm strip:examples`.

## Ce qui est décidé

### Étage produit : `/speckit-design`

- **Place** : après `/speckit-prd`, avant `/speckit-epics`, sur la même branche `docs/product-*` ; relancé à chaque révision du cadrage. Si le PRD n'existe pas, la commande s'arrête et renvoie vers `/speckit-prd`.
- **Contenu** de `specs/design.md` (gabarit `design-template` dans le preset) : utilisateurs et contextes d'usage (appareils, conditions, connexion), principes d'ergonomie, ton et vocabulaire des textes, niveau d'accessibilité visé, direction visuelle (palette, typographie, densité, arrondis, clair/sombre).
- **Effet sur le code** (décidé par l'utilisateur) : la commande modifie `theme.css` (tokens clair et sombre, rayon, espacement) et, si la direction choisit une police, l'ajoute par un paquet `@fontsource/*` (dépendance de l'app, soumise à l'audit) importé là où le thème est chargé. Rien d'autre. Ce qui demanderait plus, en particulier activer le mode sombre ou suivre le réglage du système (l'app ne pose jamais la classe `dark` aujourd'hui), est noté dans `specs/design.md` comme travail à venir, fait ensuite par une fonctionnalité normale.
- **Relance** : quand le cadrage change, la commande liste les prototypes des fonctionnalités pas encore livrées et les signale comme périmés (leurs captures ne reflètent plus le thème).
- **Validation** : avant d'écrire, l'agent montre la proposition (le document résumé et un aperçu du thème appliqué aux composants existants), et l'utilisateur valide. Rien n'est écrit avant.
- `specs/design.md` rejoint `specs/prd.md` et `specs/product.yml` dans `.github/CODEOWNERS` (il appartient au produit).

### Étage fonctionnalité : `/speckit-prototype`

- **Place** : optionnelle, lancée à la main, entre `/speckit-clarify` et `/speckit-plan`, sur la branche de la fonctionnalité. Elle lit `specs/design.md` ; s'il n'existe pas, elle le signale et continue avec le thème actuel.
- **Parcours** : `specs/NNN-<nom>/prototypes/journeys.md` (en anglais) décrit, pour chaque user story concernée, l'enchaînement écran par écran : point d'entrée, étapes, cas d'erreur et états vides. Il détaille les parcours de bout en bout de l'epic (`E03-J1` dans `product.yml`) sans les dupliquer : il les cite. L'utilisateur valide les parcours avant la maquette.
- **Maquette** (décidé par l'utilisateur) : des pages HTML/CSS statiques dans `specs/NNN-<nom>/prototypes/`, une page par écran, reliées par des liens qui suivent les parcours, avec des données factices en dur. Elles s'ouvrent directement dans le navigateur, sans build ni projet Nx. Le style passe par Tailwind 4 en version navigateur et les tokens de `theme.css` ; les composants reprennent les classes des composants de `libs/web/ui` (bouton, carte, champ…), pour que le rendu soit celui de l'app, en desktop comme en mobile. Un composant absent de `web-ui` (liste déroulante, tableau, onglets) se dessine en HTML dans le même style ; le plan prévoit alors son ajout à `web-ui`, en TDD.
- **Cadre de l'app** : l'en-tête et la navigation vivent dans `apps/web` ; la maquette en reproduit une version simplifiée, pour que les écrans, en particulier en mobile, se voient dans leur contexte.
- **Captures** : une capture par écran et par format, prise avec Playwright, nommée par écran (`checkout-mobile.png`), dans `prototypes/`. C'est le contrat visuel.
- **Retour vers la spec** : ce que la maquette révèle (étape manquante, cas d'erreur, règle) est proposé comme modification de `spec.md` et validé par l'utilisateur ; un nouveau scénario prend le numéro suivant, comme d'habitude.
- **Code jetable** : il n'est ni maintenu, ni testé, ni réutilisé ; le vrai code suit le cycle TDD.

### Agents experts : `designer` et `relecteur-design`

Décidé par l'utilisateur : un expert UX/UI (design SaaS moderne et professionnel) que les deux commandes convoquent, en deux instances distinctes : une qui produit, une qui relit à froid, sur le principe « celui qui produit ne valide pas » déjà appliqué au code.

- **Même forme que le `relecteur`** : des consignes portables dans `docs/agents/` (valables pour tout outil), et un adaptateur Claude Code dans `.claude/agents/` qui renvoie à ces consignes.
- **`designer`** (`docs/agents/designer.md`, `.claude/agents/designer.md`) produit : pour `/speckit-design`, la proposition de cadrage (`design.md`) et des tokens du thème ; pour `/speckit-prototype`, les parcours puis la maquette HTML/CSS et ses captures. Ses consignes portent l'expertise : standards d'un SaaS moderne et professionnel (hiérarchie visuelle, typographie, densité, espacement, navigation, tableaux et formulaires, états vides, de chargement et d'erreur, retours d'action, textes d'interface, responsive et mobile, accessibilité WCAG AA), plus les contraintes du dépôt (`libs/web/ui`, `theme.css`, `specs/design.md`).
- **`relecteur-design`** (`docs/agents/relecteur-design.md`, `.claude/agents/relecteur-design.md`) relit, sans rien modifier. Il part d'un contexte vierge et ne reçoit que les fichiers (PRD ou spec, `design.md`, parcours, pages et captures), jamais le résumé ni l'avis du `designer`. Sa grille : couverture des parcours et des scénarios de la spec, cohérence avec le cadrage produit, états oubliés, lisibilité mobile, accessibilité (contrastes des tokens compris), écarts aux standards SaaS ; rien sur les goûts personnels. Il rend un verdict avec des écarts bloquants ou non, preuves à l'appui (écran, capture, ligne).
- **Enchaînement dans chaque commande** : la commande (l'agent principal) recueille le contexte, convoque le `designer`, puis le `relecteur-design` ; un écart bloquant repart au `designer` pour correction, une seule fois, puis la commande montre à l'utilisateur la proposition et les écarts restants. Un écart contesté reste visible et c'est l'utilisateur qui tranche. Seule la commande parle à l'utilisateur : les sous-agents ne posent pas de questions, ils listent leurs hypothèses.
- **Parcours puis maquette** : le cycle produire, relire, montrer a lieu deux fois dans `/speckit-prototype`, une fois pour les parcours, une fois pour la maquette.
- Pas de dépendance à des skills ou plugins de design externes installés localement : l'expertise est écrite dans les consignes du dépôt, pour rester utilisable par tout agent.
- Ces fichiers sont des règles d'agents : `docs/agents/` et `.claude/agents/` sont déjà dans `.github/CODEOWNERS`, rien à ajouter.

### Commandes existantes

- `/speckit-plan` : si `prototypes/` existe, il lit `journeys.md` et les captures, les cite dans le plan et rattache chaque écran à prévoir à sa capture ; il liste les composants dessinés dans la maquette qui manquent à `web-ui` et prévoit leur ajout. Il avertit si les captures sont plus anciennes que la dernière modification de `specs/design.md`. Sans prototype, rien ne change et rien ne bloque.
- `/speckit-tasks` : les tâches d'écran citent la capture correspondante quand elle existe.
- `/speckit-specify` : si la fonctionnalité a des écrans, il mentionne en fin de commande que `/speckit-prototype` est disponible, sans l'imposer.

### Documentation

- `AGENTS.md` : la table des commandes et la section « Développer une fonctionnalité » mentionnent `/speckit-design` (cadrage) et `/speckit-prototype` (optionnelle) ; la règle « faire foi » reste dans AGENTS.md.
- `docs/guides/methode.md` : la phase « Prototyper » pointe vers `/speckit-prototype` ; on ajoute le cadrage design à l'initialisation.
- `docs/guides/spec-kit.md` et `docs/guides/design-system.md` : comment le cadrage modifie le thème.
- Constitution : à mettre à jour seulement si une règle d'AGENTS.md change (a priori non, ce sont des étapes optionnelles ou de cadrage).

## Laissé au constructeur

- Comment les pages reçoivent les tokens : `theme.css` reste l'unique source (il importe `tailwindcss` et déclare `@source`, donc il ne se charge pas tel quel dans le navigateur) ; extraction des variables vers une feuille partagée générée, ou autre moyen, tant qu'aucune valeur n'est recopiée à la main.
- Où vit ce qui est commun aux prototypes (feuille de tokens, gabarit de page, script de capture), et la version épinglée de Tailwind navigateur.
- L'effet de `pnpm format` (Prettier) et des autres vérifications sur les fichiers HTML de `specs/`.
- La forme de l'aperçu du thème montré avant validation (Storybook de `web-ui`, page d'aperçu jetable, captures).
- Les gabarits (`design-template`, structure de `journeys.md`) et leurs sections précises.
- Le contenu détaillé des consignes du `designer` et de la grille du `relecteur-design`, et le format de leurs rapports (sur le modèle de `docs/agents/relecteur.md`).
- Les formats de capture (largeurs desktop et mobile).
- Le comportement de `strip:examples` et du CI face à un dossier `prototypes/` : la CI vérifie que `pnpm check` et `spec:trace` passent avec un dossier `prototypes/` factice.
- Le découpage en PR.

## Choix faits par l'agent (à vérifier)

- Les noms `/speckit-design` et `/speckit-prototype`, et `specs/design.md`.
- `/speckit-design` placé avant `/speckit-epics` et sur la branche `docs/product-*`.
- Validation des parcours avant la construction de la maquette (deux temps).
- Les noms `designer` et `relecteur-design`, deux agents distincts plutôt qu'un seul à deux modes, et une seule boucle de correction avant de montrer à l'utilisateur.
- `specs/design.md` ajouté aux CODEOWNERS.
- Le cadrage design modifie le thème sans passer par une spec : c'est du cadrage produit validé par l'utilisateur, pas une fonctionnalité.
- Cadre de l'app reproduit en version simplifiée dans la maquette, plutôt que d'extraire le vrai cadre dans une lib.
- Pas d'exemple de cadrage ni de prototype gardé dans le boilerplate : le thème neutre reste tel quel ; les commandes sont essayées sur un passage jetable.
- Relance de `/speckit-design` : signale les prototypes périmés plutôt que de les recapturer ; `/speckit-plan` avertit sur des captures plus anciennes que le cadrage.
