# Design system

Le design system du front est la lib `libs/web/ui` (projet Nx `web-ui`, alias `@nx-react-nestjs/web-ui`) : le thème Tailwind, des primitives de mise en page et des composants shadcn/ui, chacun avec sa story Storybook. Ce guide explique comment s'en servir et comment l'étendre ; les règles courtes sont dans [`libs/web/AGENTS.md`](../../libs/web/AGENTS.md#design-system-web-ui).

## Ce que contient la lib

| Composant                                 | Rôle                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `Stack`                                   | mise en page flex : `direction`, `gap`, `align`, `justify`, `wrap`, balise par `as`          |
| `Text`, `Heading`                         | texte (`size`, `tone`, `weight`) et titres (`level` 1 à 4, obligatoire)                      |
| `Button`, `Badge`                         | variantes `variant` et `size` ; `Button asChild` pour styler un lien comme un bouton         |
| `Input`, `Textarea`, `Label`              | champs bruts                                                                                 |
| `FormField`, `TextareaField`, `FormError` | champ avec libellé, `aria-invalid` et message d'erreur reliés ; erreur globale de formulaire |
| `Card` et ses parties                     | bloc de contenu : en-tête, titre, description, contenu, pied                                 |
| `Dialog` et ses parties                   | fenêtre modale (Radix) ; `DialogContent` exige `closeLabel`                                  |
| `cn`                                      | fusionne des classes Tailwind, la dernière l'emporte (`clsx` + `tailwind-merge`)             |

Les toasts ne sont pas dans la lib : l'app utilise sonner (`<Toaster />` dans `apps/web/src/routes/__root.tsx`).

Trois règles délimitent la lib, vérifiées par le lint :

- elle ne dépend que d'elle-même : ni TanStack, ni contrats, ni autre lib ; elle est purement visuelle ;
- elle n'a aucune chaîne en dur (`lingui/no-unlocalized-strings`) : un texte, y compris un libellé d'accessibilité, arrive par les props, déjà traduit par la feature ;
- elle n'exporte que par `src/index.ts`.

## Voir les composants

```bash
pnpm nx run web-ui:storybook        # http://localhost:6006
pnpm nx run web-ui:build-storybook  # site statique dans dist/storybook/web-ui
```

La barre d'outils de Storybook bascule entre thème clair et sombre.

## Le thème

Tout le thème est dans `libs/web/ui/src/lib/styles/theme.css`, importé par l'app (`apps/web/src/styles.css`) et par Storybook. Il a trois parties :

1. **Les valeurs** : des variables CSS sur `:root` (thème clair) et `.dark` (thème sombre), en [OKLCH](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/color_value/oklch). Ce sont les tokens de shadcn, par paires : `--primary` et `--primary-foreground` (le texte posé dessus), `--muted` et `--muted-foreground`, etc.
2. **Le lien avec Tailwind** : le bloc `@theme inline` fait de chaque variable une couleur Tailwind (`--color-primary: var(--primary)`), d'où les classes `bg-primary`, `text-muted-foreground`, `border-border`… Le rayon de base (`--radius`) donne `rounded-sm` à `rounded-xl`.
3. **La base** : fond et texte de `body`, bordures par défaut.

**On n'écrit jamais une couleur en dur** (`bg-blue-600`, `#2563eb`) : on utilise un token, sinon le thème sombre et un changement de marque ne suivent pas.

**Changer l'identité visuelle** d'un projet : modifier les valeurs de `:root` et `.dark`, rien d'autre. Les composants ne changent pas. La page [Theming](https://ui.shadcn.com/docs/theming) de shadcn décrit chaque token et donne des palettes toutes faites, à recopier en gardant les noms existants.

**Ajouter un token** (par exemple `--success`) : sa valeur dans `:root` et dans `.dark`, puis sa ligne `--color-success: var(--success);` dans `@theme inline`. La classe `bg-success` existe ensuite.

**Classes générées** : Tailwind ne génère que les classes qu'il trouve dans les fichiers scannés. `styles.css` de l'app scanne `apps/web/src` et tout `libs/web` (`@source`) : une nouvelle lib sous `libs/web` est couverte sans rien changer. Une classe construite par concaténation (`` `bg-${tone}` ``) n'est pas trouvée : écrire les classes en entier, comme le font les variantes `cva`.

### Mode sombre

Les tokens sombres existent et Storybook les montre, mais **l'app ne l'active pas** : rien ne pose la classe `dark`. Pour l'activer, poser `dark` sur `<html>` (selon `prefers-color-scheme`, ou une préférence mémorisée), dans `apps/web`. Le variant `dark:` de Tailwind est défini sur cette classe (`@custom-variant dark`), pas sur la préférence du système.

## Mettre en page un écran

Pas de `<div>` stylé pour la mise en page ou le texte : `Stack`, `Text` et `Heading` couvrent les cas courants et gardent espacements et typographie cohérents.

```tsx
<Stack as="section" gap={6}>
  <Heading level={1}>{t`Commandes`}</Heading>
  <Stack direction="row" justify="between" align="center">
    <Text tone="muted">{t`Les 30 derniers jours`}</Text>
    <Button variant="outline" size="sm">
      {t`Exporter`}
    </Button>
  </Stack>
</Stack>
```

`className` reste disponible pour un besoin ponctuel (une largeur, une marge, une grille) : `cn` place les classes passées en dernier, elles l'emportent sur celles du composant. Un besoin qui revient dans plusieurs écrans mérite une variante ou un composant dans la lib. Un écran complet, de la requête à la route : [Référence : une lib feature du front](../reference/feature-web.md).

## Ajouter un composant shadcn

[shadcn/ui](https://ui.shadcn.com/docs) n'est pas une dépendance : ses composants sont du code copié dans le repo, qu'on adapte et qu'on maintient soi-même. La lib n'a pas de `components.json`, donc `shadcn add` ne s'applique pas ; on récupère le code avec `shadcn view`, qui n'a pas besoin de configuration.

Exemple avec `switch` :

1. **Récupérer le code** depuis la racine du repo :

   ```bash
   pnpm dlx shadcn@latest view switch
   ```

   La commande affiche du JSON : le code est dans `files[0].content`, les dépendances npm dans `dependencies`. La page du composant sur le site de shadcn montre le même code.

2. **Le copier** dans `libs/web/ui/src/lib/components/switch.tsx`, et l'adapter :
   - supprimer la ligne `"use client"` (directive de Next.js, inutile ici) ;
   - remplacer `import { cn } from "cn"` (ou `@/lib/utils`) par `import { cn } from '../utils/cn'` ; les autres composants de la lib s'importent aussi en relatif (`'./button'`) ;
   - `pnpm format` remet le fichier au style du repo.

3. **Vérifier les dépendances** : `radix-ui` (le paquet unifié de Radix), `lucide-react` (icônes), `class-variance-authority` et `tailwind-merge` sont déjà installés. Une autre dépendance (`cmdk`, `vaul`…) s'ajoute à la racine : `pnpm add -w <paquet>`.

4. **Sortir les textes** : un texte écrit dans le composant (libellé d'un bouton de fermeture, `sr-only`) devient une prop obligatoire, comme `closeLabel` de `DialogContent`. Le lint refuse sinon la chaîne en dur.

5. **L'exporter** depuis `libs/web/ui/src/index.ts`, avec ses parties s'il en a (`Dialog`, `DialogContent`…).

6. **Écrire sa story** `switch.stories.tsx`, avec un `play` qui vérifie le comportement :

   ```tsx
   import type { Meta, StoryObj } from '@storybook/react-vite';
   import { expect, userEvent, within } from 'storybook/test';

   import { Switch } from './switch';

   const meta = {
     title: 'Switch',
     component: Switch,
     args: { 'aria-label': 'Notifications' },
   } satisfies Meta<typeof Switch>;

   export default meta;
   type Story = StoryObj<typeof meta>;

   export const Default: Story = {
     play: async ({ canvasElement }) => {
       const toggle = within(canvasElement).getByRole('switch', { name: 'Notifications' });
       await userEvent.click(toggle);
       await expect(toggle).toBeChecked();
     },
   };

   export const Small: Story = { args: { size: 'sm' } };
   ```

7. **Vérifier** : `pnpm nx run-many -t lint typecheck test -p web-ui`.

Pour reprendre une mise à jour d'un composant déjà copié, refaire l'étape 1 et comparer : les adaptations locales (textes en props, imports) sont à reporter à la main.

## Écrire un composant maison

Même forme que les composants shadcn, pour qu'ils se lisent pareil :

- les variantes dans un `cva` (`class-variance-authority`), avec des valeurs par défaut ; une variante = un nom (`tone: 'muted'`), pas une classe passée par l'appelant ;
- des props typées par une union de valeurs, comme `Stack` (`gap?: 0 | 1 | 2 | 3 | 4 | 6 | 8`), plutôt qu'une chaîne libre ;
- les props natives de l'élément transmises (`ComponentProps<'div'>`), `className` fusionné en dernier avec `cn` ;
- uniquement des tokens du thème dans les classes ;
- un test `*.spec.tsx` quand il a de la logique (`Stack`, `Text`, `Heading` en ont un), sa story dans tous les cas.

## Les stories sont des tests

`libs/web/ui/src/stories.spec.tsx` charge toutes les stories (`*.stories.tsx`) et exécute chacune comme un test Vitest : rendu, puis sa fonction `play`, avec les mêmes décorateurs que Storybook (`src/test-setup.ts`). Une nouvelle story est donc testée sans rien déclarer, et une story qui ne se rend plus fait échouer `pnpm check`.

- Les assertions vont dans `play`, avec `expect`, `userEvent` et `within` de `storybook/test`.
- Une story sans `play` vérifie seulement que le composant se rend.
- Un callback se vérifie avec `fn()` dans `args` (voir `button.stories.tsx`).
- Ce qui s'ouvre dans un portail (dialog, menu) est sur `document.body`, pas dans `canvasElement` : `within(canvasElement.ownerDocument.body)` (voir `dialog.stories.tsx`).
- Les requêtes passent par le rôle et le nom accessible (`getByRole('switch', { name: … })`), comme dans les tests des features : un composant qu'on ne trouve pas ainsi a un problème d'accessibilité.

Les tests tournent dans jsdom : ils vérifient le comportement, pas le rendu visuel. Il n'y a pas de test de régression visuelle, et la CI ne construit pas Storybook ; un changement de style se relit dans Storybook.

## Accessibilité

- Les composants Radix (dialog, et la plupart des composants interactifs de shadcn) gèrent le focus, le clavier et les rôles ARIA : garder leur structure en les adaptant.
- Le lint `jsx-a11y` s'applique à l'app et aux libs de composants (`libs/web/.oxlintrc.web.json`).
- Tout contrôle a un nom accessible : un libellé visible (`FormField`), sinon `aria-label` passé par la feature, traduit.
- `apps/web-e2e/src/accessibility.spec.ts` passe axe (WCAG 2.1 A et AA) sur des pages réelles, en clair. Il ne voit pas le thème sombre, ni un composant que ces pages n'affichent pas.

## Pour apprendre

[Notions et ressources : Front](../notions.md#front) : Tailwind CSS, shadcn/ui, Storybook, accessibilité. En plus :

- [Theme variables](https://tailwindcss.com/docs/theme) (Tailwind 4 : `@theme`, et ce que génère chaque variable) ;
- [Theming](https://ui.shadcn.com/docs/theming) (shadcn/ui : la convention des tokens par paires) ;
- [Interaction tests](https://storybook.js.org/docs/writing-tests/interaction-testing) (Storybook : les fonctions `play`) ;
- [class-variance-authority](https://cva.style/) (les variantes).
