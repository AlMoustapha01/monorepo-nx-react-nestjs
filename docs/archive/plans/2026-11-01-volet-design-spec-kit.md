# Volet produit, UX et design de Spec Kit : plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ajouter au cycle Spec Kit un cadrage design au niveau du produit (`/speckit-design`, qui change le thème) et des prototypes HTML/CSS optionnels par fonctionnalité (`/speckit-prototype`), produits par un agent `designer` et relus à froid par un agent `relecteur-design`.

**Architecture:** deux nouvelles commandes et deux gabarits dans le preset (`tools/spec-kit/preset/`), régénérés en skills ; deux agents sur le modèle du `relecteur` (consignes portables dans `docs/agents/`, adaptateur dans `.claude/agents/`) ; un script `pnpm prototype` qui compile la feuille de style d'un prototype depuis le vrai `theme.css` (Tailwind CLI) et prend les captures (Playwright). Les commandes existantes `/speckit-plan`, `/speckit-tasks` et `/speckit-specify` reçoivent quelques règles pour lire les prototypes.

**Tech Stack:** Spec Kit 1.2.2 (preset), Node 24 (scripts `.mts` exécutés sans build, tests `node --test`), Tailwind CSS 4 (`@tailwindcss/cli`), Playwright (`@playwright/test` déjà en devDependencies).

**Spec:** `docs/superpowers/specs/2026-11-01-volet-design-spec-kit-design.md`

## Global Constraints

- Travail dans le worktree `../nx-react-nestjs-design`, branche `feat/spec-kit-design` partie de `origin/dev`. Lire `AGENTS.md` et les skills **de ce worktree**, pas ceux du checkout principal (il est en retard).
- Le worktree n'a pas de `node_modules` : `pnpm install` avant la première commande.
- Ne jamais éditer `.specify/presets/` ni `.claude/skills/speckit-*` : tout part de `tools/spec-kit/preset/`, puis `uvx --from specify-cli==1.2.2 specify preset update boilerplate --dev tools/spec-kit/preset`.
- Commandes, gabarits et documents produits par les commandes (`specs/design.md`, `journeys.md`) **en anglais** ; `docs/agents/*.md`, `docs/guides/*.md`, `AGENTS.md` **en français**, dans le style des fichiers voisins.
- Commits en anglais, Conventional Commits, avec les lignes d'attribution de la session ; ne stager que ses propres chemins, jamais `git add -A`, jamais `git stash`.
- `pnpm check` vert à la fin de chaque tâche qui touche du code ou de la config (format `oxfmt`, lint, types, tests, `spec:trace`, knip).
- `/speckit-design` ne modifie que `libs/web/ui/src/lib/styles/theme.css` et, si une police est choisie, ajoute un paquet `@fontsource/*` ; le mode sombre est noté dans `specs/design.md` comme travail à venir.
- Prototypes : pages HTML statiques à plat dans `specs/NNN-<nom>/prototypes/`, une par écran, `index.html` comme point d'entrée, `styles.css` généré, captures dans `prototypes/captures/<page>-<desktop|mobile>.png`.
- Une seule boucle de correction designer → relecteur-design avant de montrer à l'utilisateur ; seule la commande parle à l'utilisateur.
- Aucune dépendance à des skills ou plugins de design installés localement (`impeccable`, `frontend-design`…).

## Review Focus

1. Une police ajoutée par `/speckit-design` (`@fontsource/*` importé dans `theme.css`) doit apparaître dans les captures d'un prototype : les `url()` des fichiers de police doivent rester résolubles depuis `prototypes/styles.css` ouvert en `file://`. Vérifié au Task 6, étape 3.
2. `pnpm prototype` sur un dossier sans `prototypes/`, sans page HTML, ou sur un chemin qui n'est pas une fonctionnalité (`specs/prd.md`, `libs/web`) : message clair, code de sortie non nul, rien d'écrit. Testé au Task 1.
3. Chromium absent : le script échoue en nommant `pnpm exec playwright install chromium`, sans trace illisible. Task 1, étape 6.
4. Relance après la suppression d'un écran : les captures de l'ancienne page ne doivent pas survivre (le dossier `captures/` est vidé avant d'écrire). Task 1, étape 6, et Task 6.
5. Un dossier `prototypes/` présent dans `specs/` ne doit casser ni `pnpm check` (format, knip, `spec:trace`) ni `pnpm strip:examples`. Task 6, étape 4.

---

### Task 1 : script `pnpm prototype`

**Files:**

- Create: `tools/dev/prototype-core.mts`, `tools/dev/prototype-core.test.mts`, `tools/dev/prototype.mts`
- Modify: `package.json` (script `prototype`, devDependency `@tailwindcss/cli` à la version de `tailwindcss`, `^4.3.3`), `knip.json` (ajouter `prototype` à la liste `tools/dev/{…}.mts` des `entry` ; `@tailwindcss/cli` dans `ignoreDependencies`, comme `tailwindcss`, car il n'est appelé que par son binaire)

**Interfaces:**

- Produces (`prototype-core.mts`) :
  - `export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, mobile: { width: 390, height: 844 } } as const;`
  - `export type Viewport = keyof typeof VIEWPORTS;`
  - `export function prototypesDir(featurePath: string): string` : accepte `specs/NNN-<nom>`, avec ou sans `/` final ou `/prototypes`, renvoie `specs/NNN-<nom>/prototypes` ; lève une `Error` dont le message cite le chemin attendu sinon.
  - `export function entryCss(themeRelativePath: string): string` : renvoie exactement `@import '<themeRelativePath>';\n@source './*.html';\n`.
  - `export function pageFiles(names: string[]): string[]` : les `*.html` de la liste, `index.html` en tête puis ordre alphabétique ; lève une `Error` si la liste n'en contient aucun ou pas d'`index.html`.
  - `export function captureTargets(pages: string[]): { page: string; viewport: Viewport; file: string }[]` : pour chaque page puis chaque viewport (`desktop` puis `mobile`), `file` = `captures/<nom sans .html>-<viewport>.png`.
- Produces (CLI) : `pnpm prototype <specs/NNN-nom> [--capture]` ; écrit `prototypes/styles.css`, avec `--capture` remplace `prototypes/captures/`, et affiche l'URL `file://` d'`index.html`.

- [ ] **Step 1 : tests en échec** dans `tools/dev/prototype-core.test.mts` (style de `new-web-feature-core.test.mts`, `node:test` + `assert/strict`) :
  - `prototypesDir('specs/004-checkout')`, `'specs/004-checkout/'` et `'specs/004-checkout/prototypes'` → `'specs/004-checkout/prototypes'` ;
  - `prototypesDir('specs/prd.md')`, `'libs/web'`, `'specs/checkout'` → `assert.throws(…, /specs\/NNN-<name>/)` ;
  - `entryCss('../../../libs/web/ui/src/lib/styles/theme.css')` → `"@import '../../../libs/web/ui/src/lib/styles/theme.css';\n@source './*.html';\n"` ;
  - `pageFiles(['cart.html', 'styles.css', 'index.html', 'captures', 'pay.html'])` → `['index.html', 'cart.html', 'pay.html']` ;
  - `pageFiles(['styles.css'])` et `pageFiles(['cart.html'])` → `assert.throws` (message qui nomme `index.html`) ;
  - `captureTargets(['index.html', 'cart.html'])` → 4 entrées, la première `{ page: 'index.html', viewport: 'desktop', file: 'captures/index-desktop.png' }`, la dernière `{ page: 'cart.html', viewport: 'mobile', file: 'captures/cart-mobile.png' }`.
- [ ] **Step 2 :** `node --test tools/dev/prototype-core.test.mts` → FAIL (module introuvable).
- [ ] **Step 3 :** implémenter `prototype-core.mts` (fonctions pures, aucune I/O).
- [ ] **Step 4 :** `node --test tools/dev/prototype-core.test.mts` → PASS.
- [ ] **Step 5 :** `pnpm add -D @tailwindcss/cli@^4.3.3`, script `"prototype": "node tools/dev/prototype.mts"`, modifications de `knip.json`.
- [ ] **Step 6 : `tools/dev/prototype.mts`**, sur le modèle des autres CLI de `tools/dev` (en-tête de commentaire qui donne l'usage, messages en français) :
  - lit le dossier, `pageFiles(readdirSync(dir))` ; toute erreur → message sur stderr, `process.exitCode = 1`, rien d'écrit ;
  - écrit `entryCss(chemin relatif de dir vers theme.css)` dans `dir/.styles.entry.css`, lance `pnpm exec tailwindcss -i dir/.styles.entry.css -o dir/styles.css --minify` (`execFileSync`, `stdio: 'inherit'`), supprime l'entrée dans un `finally` ;
  - avec `--capture` : `rmSync(dir/captures, { recursive: true, force: true })`, puis `chromium.launch()` (`@playwright/test`) et, pour chaque `captureTargets`, une page au viewport voulu, `goto(pathToFileURL(…))`, `screenshot({ path, fullPage: true })` ; si le lancement échoue parce que le navigateur manque, message `Chromium manquant : pnpm exec playwright install chromium` et code 1 ;
  - affiche l'URL `file://` d'`index.html`.
- [ ] **Step 7 : vérifier à la main** dans un dossier jetable `specs/999-essai/prototypes/` (`index.html` avec un `<button class="bg-primary text-primary-foreground rounded-md px-4 py-2">` et un lien vers `autre.html`) : `pnpm prototype specs/999-essai --capture` → `styles.css` contient `--primary` et `.bg-primary`, 4 PNG dans `captures/`. `pnpm prototype specs/prd.md` → code 1. Puis supprimer `specs/999-essai`.
- [ ] **Step 8 :** `pnpm check` → vert.
- [ ] **Step 9 : commit** `feat(tools): add pnpm prototype to build and capture feature prototypes` (`tools/dev/prototype*.mts`, `package.json`, `pnpm-lock.yaml`, `knip.json`).

### Task 2 : agents `designer` et `relecteur-design`

**Files:**

- Create: `docs/agents/designer.md`, `docs/agents/relecteur-design.md`, `.claude/agents/designer.md`, `.claude/agents/relecteur-design.md`

**Interfaces:**

- Produces : deux sous-agents nommés `designer` et `relecteur-design`, que les Tasks 3 et 4 convoquent avec les entrées ci-dessous, et le format de rapport de chacun.

- [ ] **Step 1 : `docs/agents/designer.md`** (français, structure de `docs/agents/relecteur.md` : intro « pour tout outil », Entrées, Méthode, Standards, Livrables, Rapport) :
  - **Entrées** : le mode (`cadrage` ou `parcours` ou `maquette`), les chemins à lire (`specs/prd.md`, `specs/design.md`, `specs/NNN-<nom>/spec.md`, `journeys.md`), et, en reprise, le rapport du `relecteur-design`.
  - **Standards SaaS** (la grille d'expertise, partagée avec le relecteur) : hiérarchie visuelle et une action principale par écran ; typographie (échelle limitée, contrastes de graisse) ; densité et grille d'espacement ; navigation (où suis-je, retour, fil d'Ariane) ; tableaux (tri, état vide, pagination par curseur), formulaires (libellés visibles, erreurs au champ, `FormField`) ; états vide, chargement, erreur, succès et retour d'action ; textes d'interface (verbes d'action, pas de jargon, ton du `design.md`) ; responsive mobile d'abord pour les parcours mobiles, cibles tactiles ≥ 44 px ; accessibilité WCAG 2.2 AA (contraste 4,5:1 du texte, focus visible, ordre de tabulation, libellés).
  - **Contraintes du dépôt** : composants de `libs/web/ui` (liste dans `docs/guides/design-system.md`) et leurs classes, tokens de `theme.css` uniquement (aucune couleur en dur), un composant absent se dessine dans le même style et se signale comme « à ajouter à web-ui ».
  - **Livrables par mode** : `cadrage` → brouillon de `specs/design.md` (gabarit `design-template`) et nouvelles valeurs des tokens `:root` et `.dark` de `theme.css` (OKLCH, paires `x`/`x-foreground` qui passent 4,5:1), police éventuelle (`@fontsource/*`) ; `parcours` → `prototypes/journeys.md` (gabarit `journeys-template`) ; `maquette` → pages HTML à plat (`index.html` d'abord, `<link rel="stylesheet" href="styles.css">`, `<meta name="viewport">`, cadre d'app simplifié, données factices réalistes), puis `pnpm prototype specs/NNN-<nom> --capture`.
  - **Rapport** : ce qui a été produit (fichiers), hypothèses faites (le designer ne pose pas de questions), écarts au cadrage assumés, composants à ajouter à `web-ui`, et ce que la maquette révèle pour la spec (étape, cas d'erreur, règle manquants).
- [ ] **Step 2 : `docs/agents/relecteur-design.md`** (français, même structure que `relecteur.md`) :
  - **Entrées** : le mode et les chemins seulement ; « si on t'a transmis l'avis du designer, ignore-le ».
  - **Méthode** : lire le PRD ou la spec, `design.md`, les parcours, les pages HTML et regarder les captures (images) ; recalculer les contrastes des paires de tokens modifiées ; ne rien modifier.
  - **Grille** (chaque point bloquant s'il est avéré) : scénario ou story de la spec sans écran ou sans étape de parcours ; état vide, chargement ou erreur absent ; écart au cadrage (`design.md`) ou valeur hors tokens ; contraste < 4,5:1 (texte) ou < 3:1 (composants), focus invisible, champ sans libellé ; écran mobile illisible ou action principale hors d'atteinte ; écart aux standards SaaS de `designer.md`.
  - **Hors grille** : goûts personnels, choix esthétiques compatibles avec le cadrage, suggestions « en plus ».
  - **Rapport** : même gabarit que celui du `relecteur` (`Verdict`, `## Bloquants` avec écran/capture/ligne, Constat, Attendu ; `## À vérifier par un humain`) sans la section Couverture.
- [ ] **Step 3 : adaptateurs** `.claude/agents/designer.md` (frontmatter `name: designer`, `description` qui dit quand le lancer et avec quelles entrées, `tools: Read, Grep, Glob, Bash, Write, Edit`) et `.claude/agents/relecteur-design.md` (`tools: Read, Grep, Glob, Bash`, « ne modifie rien »), corps de deux lignes sur le modèle de `.claude/agents/relecteur.md`.
- [ ] **Step 4 :** `pnpm format` puis `pnpm format:check` → vert.
- [ ] **Step 5 : commit** `docs(agents): add the designer and the design reviewer`.

### Task 3 : commande `/speckit-design` et gabarit `design-template`

**Files:**

- Create: `tools/spec-kit/preset/templates/design-template.md`, `tools/spec-kit/preset/commands/speckit.design.md`
- Modify: `tools/spec-kit/preset/preset.yml` (entrées `design-template` et `speckit.design`, après celles du PRD), `.github/CODEOWNERS` (`/specs/design.md` après `/specs/prd.md`)

**Interfaces:**

- Consumes : agents du Task 2 (mode `cadrage`).
- Produces : `specs/design.md`, dont les sections sont lues par le designer en modes `parcours` et `maquette` : `Users and Contexts`, `UX Principles`, `Voice and Tone`, `Accessibility`, `Visual Direction`, `Theme` (tokens choisis et police), `Deferred` (dont le mode sombre).

- [ ] **Step 1 : `design-template.md`** (anglais, commentaires de gabarit comme `prd-template.md`) avec les sections ci-dessus.
- [ ] **Step 2 : `speckit.design.md`**, sur le modèle de `speckit.prd.md` (frontmatter, `## User Input`, `## Goal`, `## Steps`, `## Rules`, commentaire « A command of its own ») :
  1. **Branch** : comme `/speckit-epics` (rester sur une branche `docs/product-*`, sinon en créer une depuis `dev`, arbre propre).
  2. **Read** : `specs/prd.md` (s'arrêter et renvoyer vers `/speckit-prd` s'il manque), `specs/design.md` s'il existe, `theme.css`.
  3. **Questions** : au plus 5, une à la fois, avec réponse recommandée, sur ce qui change le cadrage (appareils, public, image de marque, accessibilité visée).
  4. **Produce** : lancer le sous-agent `designer` (mode `cadrage`) ; ailleurs que dans Claude Code, demander à l'utilisateur une nouvelle session sur `docs/agents/designer.md`, comme `/speckit-converge` pour le relecteur.
  5. **Review** : lancer `relecteur-design` avec les chemins seulement ; un écart bloquant repart une fois au `designer` avec le rapport.
  6. **Show, then wait** : résumé de `design.md`, tableau des tokens avant/après avec contrastes, aperçu du thème (`pnpm nx run web-ui:storybook`, ou captures des stories), écarts restants du relecteur. Rien n'est écrit avant l'accord.
  7. **Write** : `specs/design.md`, `theme.css`, et la police (`pnpm add @fontsource/<nom>` dans l'app, import dans `theme.css`).
  8. **Stale prototypes** : lister les `specs/NNN-*/prototypes/` des specs qui ne sont pas `Implemented` ni `Shipped` et les signaler comme périmés dans le rapport.
  9. **Check** : `pnpm check`.
  10. **Commit** : seulement `specs/design.md`, `theme.css`, `package.json`, `pnpm-lock.yaml` ; message type `docs(product): set the design direction and theme`.
  11. **Report** : changements, écarts contestés, prototypes périmés, prochaine étape `/speckit-epics`.
  - **Rules** : aucun autre fichier de code que `theme.css` et la police ; mode sombre et densité au-delà de `--spacing` vont dans `Deferred`.
- [ ] **Step 3 :** entrées dans `preset.yml` (`type: 'template'` sans `replaces`, `type: 'command'` sans `strategy`, comme le PRD) et ligne CODEOWNERS.
- [ ] **Step 4 :** réinstaller le preset (commande des Global Constraints) → `.claude/skills/speckit-design/SKILL.md` existe et contient « designer ».
- [ ] **Step 5 :** `pnpm check` → vert.
- [ ] **Step 6 : commit** `feat(spec-kit): add /speckit-design for the product design direction` (sources du preset, fichiers générés `.specify/` et `.claude/skills/speckit-design/`, CODEOWNERS).

### Task 4 : commande `/speckit-prototype` et gabarit `journeys-template`

**Files:**

- Create: `tools/spec-kit/preset/templates/journeys-template.md`, `tools/spec-kit/preset/commands/speckit.prototype.md`
- Modify: `tools/spec-kit/preset/preset.yml`

**Interfaces:**

- Consumes : `pnpm prototype` (Task 1), agents (Task 2, modes `parcours` et `maquette`), `specs/design.md` (Task 3).
- Produces : `specs/NNN-<nom>/prototypes/` avec `journeys.md`, pages, `styles.css`, `captures/`, lus par le Task 5.

- [ ] **Step 1 : `journeys-template.md`** (anglais) : par user story, `### J<n>: <title>` avec `Covers` (ids `NNN-USx-ASy` et étape de l'epic `E03-J1` citée, jamais recopiée), `Entry point`, étapes numérotées `screen → action → result` (chaque écran nommé comme sa page, `cart` → `cart.html`), `Errors and empty states`.
- [ ] **Step 2 : `speckit.prototype.md`** (anglais, modèle de `speckit.prd.md`) :
  1. **Feature** : sur la branche de la fonctionnalité, `spec.md` présent et sans `[NEEDS CLARIFICATION]` ; sinon renvoyer vers `/speckit-clarify`. Si `specs/design.md` manque, le dire et continuer avec le thème actuel.
  2. **Journeys** : `designer` (mode `parcours`) → `relecteur-design` → une reprise si bloquant → montrer les parcours et les écarts restants → attendre l'accord.
  3. **Mockup** : `designer` (mode `maquette`) → `relecteur-design` → une reprise → montrer l'URL `file://`, les captures et les composants à ajouter à `web-ui` → attendre l'accord.
  4. **Back to the spec** : proposer ce que la maquette révèle comme modification de `spec.md` (nouveau scénario au numéro suivant, jamais de renumérotation) ; n'écrire qu'après accord.
  5. **Check** : `pnpm -s spec:trace specs/NNN-<nom>` et `pnpm format:check`.
  6. **Commit** : `specs/NNN-<nom>/prototypes/` et `spec.md` s'il a changé ; message type `docs(<nom>): add the prototype`.
  7. **Report** : écrans, composants manquants, changements de spec, prochaine étape `/speckit-plan`.
  - **Rules** : le prototype ne touche aucun fichier hors de `specs/NNN-<nom>/` ; son code n'est jamais repris dans `apps/` ni `libs/`.
- [ ] **Step 3 :** entrées dans `preset.yml` ; réinstaller le preset → `.claude/skills/speckit-prototype/SKILL.md` existe.
- [ ] **Step 4 :** `pnpm check` → vert.
- [ ] **Step 5 : commit** `feat(spec-kit): add /speckit-prototype for journeys and clickable mockups`.

### Task 5 : règles ajoutées à `/speckit-plan`, `/speckit-tasks` et `/speckit-specify`

**Files:**

- Modify: `tools/spec-kit/preset/commands/speckit.plan.md`, `speckit.tasks.md`, `speckit.specify.md` (sections ajoutées, en anglais, titre suffixé `(boilerplate)` comme les autres)

- [ ] **Step 1 : `speckit.plan.md`**, section `## Prototype (boilerplate)` : si `prototypes/` existe, lire `journeys.md` et les captures, citer chaque capture à côté de l'écran qu'elle fixe, prévoir l'ajout à `web-ui` des composants signalés manquants ; si la date du dernier commit des captures (`git log -1 --format=%cI -- <captures>`) est antérieure à celle de `specs/design.md`, l'écrire dans le plan et le dire à l'utilisateur. Sans prototype, rien ne change.
- [ ] **Step 2 : `speckit.tasks.md`**, dans « Before Writing the Tasks » : une tâche d'écran cite sa capture quand elle existe ; un composant manquant à `web-ui` devient une tâche (test et story Storybook) avant l'écran qui l'utilise.
- [ ] **Step 3 : `speckit.specify.md`**, section `## Next Step (boilerplate)` : si la fonctionnalité a des écrans, mentionner dans le rapport que `/speckit-prototype` est disponible, après `/speckit-clarify`, sans l'imposer.
- [ ] **Step 4 :** réinstaller le preset ; `grep -l "speckit-prototype\|prototypes/" .claude/skills/speckit-{plan,tasks,specify}/SKILL.md` → les trois fichiers.
- [ ] **Step 5 :** `pnpm check` → vert.
- [ ] **Step 6 : commit** `feat(spec-kit): read prototypes in plan and tasks`.

### Task 6 : documentation et essai de bout en bout

**Files:**

- Modify: `AGENTS.md` (table des commandes : lignes `/speckit-design` et `pnpm prototype` ; section « Développer une fonctionnalité » : cadrage après `/speckit-prd`, étape optionnelle `/speckit-prototype` entre clarify et plan, agents `designer` et `relecteur-design` ; bloc Structure : `docs/agents/` cite les trois agents), `docs/guides/methode.md` (phase « Prototyper » → `/speckit-prototype` et HTML/CSS ; cadrage design dans l'initialisation ; puce « Prototypes » mise à jour), `docs/guides/spec-kit.md` (les deux commandes et leurs agents), `docs/guides/design-system.md` (section « Le thème » : `/speckit-design` le modifie ; les prototypes en dérivent par `pnpm prototype`)

- [ ] **Step 1 :** écrire ces mises à jour (français, style des fichiers ; pas de règle nouvelle dans la constitution : les étapes sont optionnelles ou de cadrage).
- [ ] **Step 2 : essai jetable, rien de commité.** Dans une copie de travail jetable : écrire un `specs/prd.md` minimal, lancer `/speckit-design` jusqu'à l'écriture (avec une police), puis créer un `specs/900-essai/spec.md` minimal et lancer `/speckit-prototype` jusqu'aux captures. Noter tout ce qui coince dans les commandes ou les consignes et le corriger dans le preset ou `docs/agents/` (puis réinstaller).
- [ ] **Step 3 : police (Review Focus 1)** : ouvrir une capture de l'essai ; la police choisie est visible. Sinon, corriger `prototype.mts` (par exemple copier les fichiers de police à côté de `styles.css`, ou importer la police dans `entryCss`) avec un test dans `prototype-core.test.mts`.
- [ ] **Step 4 : non-régression (Review Focus 5)** : avec le `specs/900-essai/prototypes/` de l'essai en place, `pnpm check` → vert, puis, dans la copie jetable seulement (le script modifie l'arbre), `pnpm strip:examples` : il réussit et laisse `prototypes/` intact. Vérification ponctuelle, pas de fixture permanente dans `specs/` (le boilerplate n'a pas de dossier `specs/`). Ensuite, supprimer l'essai et revenir au thème neutre : `git status` ne montre que les fichiers de ce Task.
- [ ] **Step 5 :** `pnpm check` → vert.
- [ ] **Step 6 : commit** `docs: document the design direction and prototypes in Spec Kit`.
