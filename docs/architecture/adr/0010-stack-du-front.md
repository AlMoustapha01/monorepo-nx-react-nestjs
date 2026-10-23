# 0010. Stack du front

- **Statut** : Acceptée
- **Date** : 2026-10-21

## Contexte

Le front doit offrir le même cadre que l'API : des frontières entre libs, un état serveur cohérent, des formulaires validés par les mêmes schémas que l'API, une interface traduisible et accessible, et des règles vérifiées par l'outillage plutôt que par la seule revue. Les choix ont été arrêtés avec l'utilisateur dans [la conception du socle web](../../archive/specs/2026-10-21-web-boilerplate-design.md).

## Décision

| Besoin           | Choix                                                                                |
| ---------------- | ------------------------------------------------------------------------------------ |
| Build            | Vite, React Compiler                                                                 |
| Routage          | TanStack Router, routes fichier chargées à la demande, search params validés par zod |
| État serveur     | TanStack Query, une fabrique `queryOptions` par ressource                            |
| État d'interface | `useState` d'abord ; un store global seulement si un état traverse l'arbre           |
| Formulaires      | react-hook-form avec les schémas zod des contrats                                    |
| UI               | Tailwind 4 et composants shadcn/ui copiés dans `libs/web/ui`, Storybook              |
| i18n             | Lingui, extraction vérifiée en CI, chaînes en dur interdites par le lint             |
| Tests            | Vitest, Testing Library, MSW ; Playwright contre la vraie stack                      |
| Qualité          | Oxlint (React, jsx-a11y, frontières Nx), Oxfmt, knip, size-limit                     |

`fetch` direct est interdit hors de `libs/web/data-access`.

## Conséquences

- Un formulaire valide une entrée avec le schéma que l'API applique ensuite : une seule source de vérité.
- Les composants shadcn sont du code du repo : modifiables, mais à maintenir soi-même.
- Pas de préfixe de langue dans l'URL : la langue vient du navigateur, puis d'une préférence mémorisée.
