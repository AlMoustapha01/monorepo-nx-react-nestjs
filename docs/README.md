# Documentation

Les règles et conventions du code sont dans [`AGENTS.md`](../AGENTS.md) (et [`apps/web/AGENTS.md`](../apps/web/AGENTS.md), [`libs/web/AGENTS.md`](../libs/web/AGENTS.md) pour le front). Ce dossier contient ce qui ne sert pas à chaque session de code : les procédures, pas à pas.

Le comportement des fonctionnalités d'un projet n'est pas décrit ici, mais dans ses specs (`specs/NNN-<nom>/spec.md`).

## Je veux…

| …                                                                        | Lire                                                         |
| ------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Lancer le projet pour la première fois                                   | [README](../README.md#démarrer)                              |
| Me connecter avec de vrais comptes, utiliser un autre fournisseur        | [Authentification en local](guides/auth-en-local.md)         |
| Corriger une faille de dépendance, comprendre Renovate                   | [Dépendances et failles](guides/dependances.md)              |
| Faire évoluer une spec après son merge, changer son statut               | [Spec Kit : cycle de vie et maintenance](guides/spec-kit.md) |
| Personnaliser Spec Kit, l'utiliser avec un autre agent, le mettre à jour | [Spec Kit : cycle de vie et maintenance](guides/spec-kit.md) |

`superpowers/` contient les specs et plans de travail qui ont servi à construire le boilerplate : un historique, pas une documentation à jour.
