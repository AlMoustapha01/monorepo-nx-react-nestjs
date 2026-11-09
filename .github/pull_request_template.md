## Quoi et pourquoi

<!-- Le changement, et la spec ou l'issue d'où il vient (specs/NNN-<nom>, user story). -->

## Vérifications

- [ ] Comportement modifié d'une fonctionnalité spécifiée : son `spec.md` est à jour (scénarios ajoutés, modifiés ou retirés, jamais renumérotés)
- [ ] Chaque test qui cite un scénario (`NNN-USx-ASy`) vérifie bien ce scénario

<!-- option:feature-flags:start -->

- [ ] Feature flag supprimé : la spec passe en `Shipped`, relue

<!-- option:feature-flags:end -->

- [ ] `pnpm check` passe
