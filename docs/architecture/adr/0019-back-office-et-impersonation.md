# 0019. Back-office et impersonation : le support voit ce que voit le client, avec trace

- **Statut** : Acceptée
- **Date** : 2026-11-17

## Contexte

Pour aider un client, le support doit voir l'application comme lui : ses données, ses écrans, ses erreurs. Sans outil, il demande des captures ou un mot de passe partagé, sans trace. Un client B2B attend l'inverse : savoir qui est entré dans son compte, quand, et ce qu'il y a fait.

## Décision

- **Opérateurs de la plateforme** : le rôle `admin` du plugin admin de Better Auth (`user.role`, constante `OPERATOR_ROLE` des contrats), distinct des rôles d'une organisation (`owner`, `admin`, `member`) et du rôle `staff` de l'API. Il ne se donne que par une commande d'exploitation, `node operators.js list | grant <email> | revoke <email>` (image du service d'identité, `pnpm dev:operator` en local). Aucune route HTTP ne le donne : du plugin admin, seules `/admin/impersonate-user` et `/admin/stop-impersonating` restent ouvertes (`disabledPaths`). Un opérateur ne peut donc ni en nommer un autre, ni changer un mot de passe, ni bannir.
- **Back-office** : page `/support` du front, hors des pages d'un tenant (un opérateur n'est membre d'aucune organisation, ou pas de celles qu'il aide). Une recherche, `GET /api/auth/operator/search?query=` (email, nom ou nom d'organisation, 20 comptes au plus, 403 `OPERATOR_REQUIRED` pour un autre), montre chaque compte avec ses organisations et ses rôles, et un bouton « Voir comme ». Pour qui n'est pas opérateur, la page n'existe pas (404) et le lien n'est pas affiché.
- **Impersonation** : tout compte qui n'est pas opérateur (`allowImpersonatingAdmins: false`), **une heure au plus** (`impersonationSessionDuration`, et un hook `session.update` qui empêche `/get-session` de la prolonger au-delà, ce qu'il ferait de 7 jours sans le cookie « ne pas se souvenir de moi »). Le plugin crée une session au nom du client, marquée `impersonatedBy`, et garde celle de l'opérateur dans un cookie signé, qu'« Arrêter » restaure. **L'opérateur doit avoir la 2FA**, ou une session ouverte par passkey (403 `OPERATOR_TWO_FACTOR_REQUIRED`) : la session impersonée vaut alors la 2FA qu'une organisation du client exige (ADR 0017), puisque l'opérateur l'a passée.
- **Le token nomme l'opérateur** : claim `act: { sub: <opérateur> }` (RFC 8693, délégation). L'API la lit (`Principal.impersonatorId`, `RequestContext.impersonatorId`), l'outbox la garde (`messaging.outbox.impersonator_id`) et le worker la rend au handler : une action faite pendant l'impersonation est inscrite au journal au nom du client **et** de l'opérateur (`audit.entries.impersonator_id`, exposé par `GET /audit/entries`). De même pour une action du service d'identité depuis une session impersonée.
- **Journal du client** : `identity.impersonation-started` et `identity.impersonation-stopped`, une ligne dans chaque organisation du client, l'opérateur pour acteur et le client pour ressource. Le client les voit dans son journal (« Le support est entré dans le compte », par « Support de la plateforme »), et une action faite pour lui porte « via le support de la plateforme ».
- **Fin de l'impersonation** : les tokens du client sont révoqués dans chacune de ses organisations (ADR 0016), avant et après l'action : un token émis pendant l'impersonation ne survit pas à son arrêt.
- **Bandeau** : pendant la session impersonée, chaque page porte un bandeau qui nomme le compte, rappelle que tout est inscrit au nom de l'opérateur et la limite d'une heure, avec « Revenir à mon compte », qui ramène au back-office.
- **Pas de feature flag. Écart au principe 6, choisi** : les flags se lisent avec un token qui porte un tenant, que le back-office n'a pas. La fonctionnalité reste inerte tant qu'aucun opérateur n'est nommé, ce qui demande une commande d'exploitation : c'est l'équivalent d'un flag coupé par défaut.

## Conséquences

- La révocation de fin touche aussi les tokens du client lui-même, connecté ailleurs : son client web réessaie une fois un 401 avec un token neuf (ADR 0016), sans qu'il le voie.
- Une impersonation qui expire au bout d'une heure sans « Arrêter » n'a pas de ligne `impersonation-stopped` : la ligne de début et la limite d'une heure bornent la période. Les tokens émis pendant la session expirent seuls, 15 minutes au plus après. L'opérateur se reconnecte.
- `revoke` retire le rôle pour la suite (nouvelle impersonation, recherche) ; une impersonation déjà ouverte va à son terme, une heure au plus.
- Le plugin admin ajoute des colonnes au schéma `auth` (`user.role`, `banned`, `banReason`, `banExpires`, `session.impersonatedBy`), créées par la migration habituelle du service ; et deux colonnes nullables côté API (`messaging.outbox`, `audit.entries`) : ajouts seulement, rétrocompatibles.
- Un opérateur sans organisation arrive sur `/support` après la connexion, avec son compte et un lien vers `/securite`, qui lui reste ouverte (sans flags) pour activer la 2FA. Un opérateur qui est aussi client (membre d'une organisation) a le lien « Back-office » dans sa navigation.
- La gestion des flags par tenant (aujourd'hui `node feature-flags.js`, ADR 0014) a sa place dans ce back-office : une PR suivante.

## Alternatives écartées

- **Route HTTP pour nommer les opérateurs** (`/admin/set-role` du plugin) : un compte opérateur volé en nommerait d'autres. La commande demande un accès à l'infrastructure.
- **Impersonation en lecture seule** : le support doit souvent refaire le geste du client pour comprendre son erreur. Tout est permis, mais tout est tracé, au nom des deux.
- **Accord du client avant chaque impersonation** : plus sûr, mais il bloque le support sur un client injoignable ; le journal visible du client et la limite d'une heure ont été préférés. Une organisation pourra demander ce réglage plus tard.
- **Compte de support invité dans chaque organisation** : le support verrait le compte de cette organisation, pas celui du client, et il resterait membre après coup.
