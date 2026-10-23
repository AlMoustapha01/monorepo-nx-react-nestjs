# Votre première fonctionnalité

Ce tutoriel suit une fonctionnalité de bout en bout avec Spec Kit, dans Claude Code : de la description en une phrase jusqu'à la première user story implémentée, testée et prête à merger. Les règles de chaque étape sont dans [`AGENTS.md`](../../AGENTS.md) § « Développer une fonctionnalité (Spec Kit) » ; ce tutoriel montre à quoi elles ressemblent en pratique.

L'exemple, **Annonces**, a été déroulé pour de vrai sur le boilerplate : les extraits ci-dessous sont ceux qu'il a produits. Il ne dépend d'aucun domaine d'exemple, il reste donc valable après `pnpm strip:examples`.

Prérequis : le projet tourne en local ([README](../../README.md#démarrer)) et Docker est lancé (tests d'intégration et parcours navigateur).

## Le cycle en un coup d'œil

| Étape          | Commande                                  | Produit (`specs/NNN-<nom>/`)                               | Vous relisez                                             |
| -------------- | ----------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------- |
| 1. Spécifier   | `/speckit-specify <description>`          | La branche `NNN-<nom>`, `spec.md`                          | Chaque scénario se vérifie sans jugement humain          |
| 2. Clarifier   | `/speckit-clarify`                        | `spec.md` (section Clarifications)                         | Les réponses sont reportées dans les exigences           |
| 3. Planifier   | `/speckit-plan`                           | `plan.md`, `research.md`, `data-model.md`, `contracts/`    | Chaque principe de la constitution, un test par scénario |
| 4. Découper    | `/speckit-tasks`, puis `/speckit-analyze` | `tasks.md`                                                 | Les incohérences signalées, corrigées dans les documents |
| 5. Implémenter | `/speckit-implement`                      | Le code et ses tests, tâche par tâche                      | Chaque test vu en échec avant le code                    |
| 6. Converger   | `/speckit-converge`                       | Tâches manquantes ajoutées à `tasks.md`, statut de la spec | `pnpm -s spec:trace`                                     |

Les specs, plans et tâches sont en anglais, même si vous décrivez la fonctionnalité en français.

## 1. Spécifier : le quoi et le pourquoi

Partez de `main` à jour, arbre propre :

```
/speckit-specify Annonces : le staff d'une organisation publie des annonces courtes (titre, texte) ; tous les membres de l'organisation voient les annonces publiées sur la page d'accueil, la plus récente en premier. Le staff peut retirer une annonce.
```

La commande crée d'abord la branche `001-announcements` et s'y place (hook de l'extension `git` de Spec Kit) : elle s'arrête si l'arbre a des modifications non commitées, et demande confirmation si vous n'êtes pas sur `main`. Le numéro suit les specs et les branches existantes, locales et distantes. Elle écrit ensuite `specs/001-announcements/spec.md`, du même nom que la branche, et une checklist de qualité. La fonctionnalité en cours est mémorisée dans `.specify/feature.json` (ignoré par git) : les commandes suivantes la retrouvent sans argument.

Elle peut déjà poser jusqu'à trois questions (`[NEEDS CLARIFICATION]`) quand un point bloque l'écriture ; ici, la longueur maximale du titre et du texte, et si une annonce retirée peut être restaurée.

La spec ne parle pas de technique : des user stories, chacune avec ses scénarios d'acceptation numérotés, des exigences et des critères de succès. En tête, le statut :

```markdown
# Feature Specification: Announcements

**Feature Branch**: `001-announcements`

**Status**: Draft
```

Chaque scénario a un identifiant `<feature>-US<story>-AS<n>`, que les tests citeront :

```markdown
### User Story 1 - Publish an announcement and see it on the home page (Priority: P1)

1. **Given** a staff member of an organization, **When** they publish an announcement with a
   title and a text, **Then** the announcement is published, with its author and its publication time.
   …
2. **Given** a member who is not staff, **When** they try to publish an announcement,
   **Then** they are refused and nothing is published.
3. **Given** announcements published in another organization, **When** a member opens the home
   page, **Then** they do not see the other organization's announcements.
```

Ici `001-US1-AS3` est le refus pour un non-staff.

**À relire** : chaque scénario se vérifie par un test, sans jugement (« la page est claire » ne se teste pas). La règle d'accès (AS3) et l'isolation entre organisations (AS4) sont des scénarios à part entière. Une fois des tests écrits, ne renumérotez plus les scénarios.

## 2. Clarifier

```
/speckit-clarify
```

Au plus cinq questions, une à la fois, chacune avec une réponse recommandée. Pour Annonces :

| Question                                          | Réponse                                                       |
| ------------------------------------------------- | ------------------------------------------------------------- |
| Combien d'annonces sur l'accueil ?                | Les 20 plus récentes, puis « voir plus » par 20               |
| Que voit un membre en plus du titre et du texte ? | La date de publication ; l'auteur est enregistré, pas affiché |
| Le staff voit-il les annonces retirées ?          | Non, plus personne                                            |
| Texte brut ou enrichi ?                           | Texte brut, retours à la ligne conservés                      |
| Où le staff publie-t-il et retire-t-il ?          | Sur l'accueil, réservé au staff, retrait après confirmation   |

Les réponses sont consignées dans une section `## Clarifications` et reportées dans les exigences et les scénarios. **À relire** : chaque réponse a bien modifié une exigence ou un scénario, pas seulement la section Clarifications.

## 3. Planifier : le comment

```
/speckit-plan
```

Le plan suit le gabarit du boilerplate : il coche chaque principe de la constitution, puis décide domaines, flag, événements, données, règles d'accès et stratégie de test.

```markdown
- [x] I. Tenant Isolation: `announcements.announcements` has `tenant_id`; every repository query
      goes through `tenantScope()` reading `RequestContext`.
- [x] III. Secure by Default: all routes authenticated; publish and withdraw carry
      `@RequireRole('staff')`; a foreign or withdrawn announcement answers 404.
- [x] VI. Small, Flagged Increments: flag `announcements`, default `false`; …

## Feature Flag

- **Name**: `announcements` - **Default**: `false` - **Client**: `true`

## Data & Migrations

- **Migration**: `pnpm nx run api:db-generate --name=announcements`; additive only (new schema,
  enum and table), nothing to contract.

## Access Rules

- **Role required**: `POST /api/v1/announcements` → `staff`; `GET /api/v1/announcements` → any
  authenticated member; `POST /api/v1/announcements/:id/withdraw` → `staff`.
```

La section **Test Strategy** associe chaque scénario à un niveau de test et à un fichier :

```markdown
| 001-US1-AS3 non-staff cannot publish | API e2e | `apps/api/tests/announcements.e2e.spec.ts` |
| 001-US1-AS4 other organizations' announcements are invisible | unit + integration | … |
```

**À relire** :

- chaque case de la constitution, une par une ; une entorse se justifie dans « Complexity Tracking » ;
- une ligne par scénario dans Test Strategy ;
- le nouveau domaine n'importe aucun domaine d'exemple (sinon `strip:examples` le casse) ;
- comment le front sait ce que l'utilisateur a le droit de faire. Le front ne connaît pas les rôles : ici, `GET /announcements` renvoie `canManage`, calculé dans le cas d'usage.

## 4. Découper en tâches, puis analyser

```
/speckit-tasks
/speckit-analyze
```

`tasks.md` range les tâches par phase (Setup, Foundational, puis une phase par user story, Polish). Les tâches de test sont obligatoires et viennent avant le code qu'elles couvrent :

```markdown
- [ ] T011 [P] [US1] Unit tests with the in-memory fake in `…/announcements.application.spec.ts`:
      `001-US1-AS1: publishes an announcement with its author and publication time`; …
      run `pnpm nx test api-announcements` and confirm they FAIL
- [ ] T012 [P] [US1] API end-to-end tests in `apps/api/tests/announcements.e2e.spec.ts`: …; confirm they FAIL
- [ ] T013 [US1] Implement `PublishAnnouncement` and `ListAnnouncements` … until T011 passes
- [ ] T014 [US1] Add `AnnouncementsController` (`@RequireFeature('announcements')`; `POST` with
      `@RequireRole('staff')` and `@Idempotent({ required: true })`; `GET`) … until T012 passes
```

`/speckit-analyze` ne modifie rien : il compare spec, plan et tâches. Prenez ses remarques au sérieux. Ici, il a trouvé une vraie contradiction : la spec disait qu'un second retrait simultané répond « n'existe plus », le plan prévoyait un 409. La correction se fait dans les documents (plan, tâches), puis on relance l'analyse.

### Une user story par PR

Chaque user story part dans sa propre PR. La première embarque aussi la phase Foundational (contrats, entité, repository, migration) : sur Annonces, environ 1 600 lignes pour US1, tests compris. Le flag reste coupé tant que la dernière story n'est pas mergée : chaque PR est déployable seule.

## 5. Implémenter, en TDD

```
/speckit-implement
```

Implémentez une user story à la fois : demandez explicitement de s'arrêter après US1. Pour chaque tâche de test, la commande écrit le test, le lance et **le voit échouer** avant de cocher la tâche ; une tâche de code n'est cochée qu'une fois ses tests verts. Un test cite son scénario au début de son titre :

```ts
it('001-US1-AS3: refuses to publish for a member who is not staff', async () => {
```

À la fin de la story, le point de contrôle doit passer :

```sh
pnpm nx affected -t lint typecheck test e2e
```

Ce qui a coincé sur Annonces, et que vous croiserez sans doute :

- **Premier échec** : sur un fichier neuf, c'est `Cannot find module './announcement'`. C'est un vrai rouge, mais un squelette vide donne un échec plus parlant (une assertion fausse).
- **Un test qui passe du premier coup** (ici « le bloc est masqué quand le flag est coupé ») : c'est un garde-fou de régression, la commande le signale au lieu de le compter comme TDD.
- **Ordre par date** : 21 annonces créées dans la même milliseconde sortent dans le désordre. Figer l'horloge (`vi.setSystemTime`).
- **Lint** : les règles d'accessibilité (`jsx-a11y`) et de traduction (`lingui/no-unlocalized-strings`) mordent tôt ; lancer `lint` souvent. knip signale les exports inutilisés.
- **Catalogues de traduction** : `web:i18n-check` compare au dernier commit, il échoue tant que les `.po` mis à jour ne sont pas commités. Traduire les nouvelles chaînes en anglais.
- **Nouveau domaine** : `pnpm new:domain announcements` crée la lib, sa façade et son module enregistré dans l'AppModule ; le reste s'écrit en TDD. Côté front, `pnpm new:web-feature announcements` crée la lib feature, avec `renderWithProviders` pour les tests de composants.
- **Accessibilité** : toute nouvelle page s'ajoute à `apps/web-e2e/src/accessibility.spec.ts` (axe, formulaire en erreur compris), et son flag à `E2E_FEATURE_FLAGS` dans `apps/web-e2e/src/stack.ts` : sans lui, la page répond 404 pendant les parcours. Après `signIn`, attendre la page d'accueil avant de naviguer, sinon la navigation coupe la connexion.
- **Composant manquant** dans `libs/web/ui` (ici `Textarea`) : l'ajouter avec sa story, et le mentionner dans le plan.

## 6. Converger

```
/speckit-converge
```

La commande compare le code à la spec, au plan et aux tâches, lance `pnpm -s spec:trace`, et ajoute à `tasks.md` ce qui manque encore. Elle ne conclut « Converged », et ne passe la spec en `Implemented`, que quand **tous** les scénarios de la spec ont un test.

```sh
pnpm -s spec:trace                          # toutes les specs, comme la CI
pnpm -s spec:trace specs/001-announcements  # celle-ci, en mode strict
```

```
## specs/001-announcements (Draft) : OK
| 001-US1-AS1 | apps/api/tests/announcements.e2e.spec.ts<br>…/announcements.application.spec.ts<br>…/announcements-board.spec.tsx |
| 001-US1-AS3 | apps/api/tests/announcements.e2e.spec.ts |
| 001-US2-AS1 | **aucun** |
Spec en Draft : 3 scénario(s) encore sans test, toléré. Passer le statut à Implemented quand tous sont couverts.
```

Après US1, la spec reste donc `Draft` : les scénarios de US2 n'ont pas encore de test, ce que la CI tolère pour une spec en Draft. Le mode strict, lui, échoue tant qu'il en manque : c'est normal à ce stade.

## 7. Ouvrir la PR

Avant d'ouvrir la PR :

```sh
pnpm check
```

Puis remplir le modèle de PR (`.github/pull_request_template.md`) : la spec et la user story d'où vient le changement, et la relecture des tests qui citent un scénario. `spec:trace` prouve qu'un test cite chaque scénario, pas qu'il le vérifie bien : c'est le rôle de la revue.

Ensuite, même cycle pour US2 (`/speckit-implement`, `/speckit-converge`) : la dernière story passe la spec en `Implemented`.

## Après le merge

- **Activer** : `FEATURE_FLAGS=announcements=true` dans l'environnement voulu, puis redémarrer l'API : aucun code à redéployer.
- **Livrer** : une fois la fonctionnalité active partout, une PR supprime le flag et ses branches mortes, et passe la spec en `Shipped` (relire la spec à ce moment).
- **Faire évoluer** : un changement de comportement modifie `spec.md` dans la même PR ; un scénario ne se supprime pas, il se retire. Voir [Spec Kit : cycle de vie et maintenance](../guides/spec-kit.md).
