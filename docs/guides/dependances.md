# Dépendances et failles

## Audit

`.github/workflows/audit.yml` tourne sur les PR qui touchent les dépendances et chaque jour sur `main`. Il bloque :

- toute faille connue d'une dépendance de production (`pnpm audit --prod --audit-level=moderate`) ;
- les failles hautes et critiques des outils de dev (`pnpm audit --audit-level=high`).

En local : `pnpm audit --prod`.

## Corriger une faille

1. **Mettre à jour le paquet**, si une version corrigée existe et qu'il est une dépendance directe.
2. **Paquet épinglé par une dépendance** : une override ciblée dans `pnpm-workspace.yaml`, sous la forme `'parent>paquet': '<version>'`. La commenter avec l'advisory (GHSA) et la condition de retrait (« retirer quand `parent` dépend de `paquet` ≥ x.y »).
3. **Aucun correctif publié** : ajouter le GHSA à `auditConfig.ignoreGhsas` dans `pnpm-workspace.yaml`, avec la raison pour laquelle la faille n'est pas exploitable ici.

Pas de `.pnpmfile.cjs` : Renovate l'ignore (`--ignore-pnpmfile`), et ses lockfiles ne correspondraient plus à ceux de la CI.

## Renovate

`renovate.json` configure l'application GitHub Renovate, à installer sur le repo :

- PR groupées (`nx`, `nestjs`…) le lundi matin, et maintenance du lockfile au même moment ;
- versions publiées depuis au moins 3 jours ;
- failles corrigées sans attendre, avec le label `security` ;
- une majeure de Postgres reste manuelle (migration des données).

Renovate ne suit pas Spec Kit : voir [Spec Kit : maintenance](spec-kit.md#mettre-à-jour-spec-kit).
