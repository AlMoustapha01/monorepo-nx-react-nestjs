# Archive

Les documents de conception (`specs/`) et les plans d'implémentation (`plans/`) qui ont servi à construire le boilerplate, avant l'adoption de Spec Kit. Ils sont gardés pour l'historique : ce qu'on voulait faire, pourquoi, et dans quel ordre.

Ils ne sont pas tenus à jour et ne décrivent pas forcément le code actuel. Les chemins qu'ils citent sont ceux d'origine (`docs/superpowers/…`), sans correction.

| Date       | Conception                                                   | Plan                                        |
| ---------- | ------------------------------------------------------------ | ------------------------------------------- |
| 2026-10-21 | [Socle du front](specs/2026-10-21-web-boilerplate-design.md) | [Plan](plans/2026-10-21-web-boilerplate.md) |
| 2026-10-21 | [Boutique d'exemple](specs/2026-10-21-storefront-design.md)  | [Plan](plans/2026-10-21-storefront.md)      |
| 2026-10-22 | [Spec Kit](specs/2026-10-22-spec-kit-design.md)              | [Plan](plans/2026-10-22-spec-kit.md)        |

Pour l'état actuel :

- les règles : [`AGENTS.md`](../../AGENTS.md) ;
- les décisions et leurs raisons : [ADR](../architecture/adr/README.md), écrits en partie à partir de ces documents ;
- le comportement d'une fonctionnalité : sa spec Spec Kit, dans `specs/` à la racine.

Les documents de la boutique d'exemple disparaissent avec `pnpm strip:examples`.
