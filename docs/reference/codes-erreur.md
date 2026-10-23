# Référence : codes d'erreur

Les erreurs que l'API renvoie, et comment les lire. Pourquoi ce modèle : [ADR 0009](../architecture/adr/0009-erreurs-rfc-9457.md).

## Format d'une réponse en erreur

Toute erreur est une réponse `application/problem+json` (RFC 9457), avec un `code` stable en plus :

```json
{
  "type": "urn:problem-type:order-not-found",
  "title": "Not Found",
  "status": 404,
  "code": "ORDER_NOT_FOUND",
  "detail": "Order ORD-1m5ga9t70gxttex9f42j not found",
  "instance": "/api/v1/orders/ORD-1m5ga9t70gxttex9f42j"
}
```

| Champ      | Contenu                                                                              |
| ---------- | ------------------------------------------------------------------------------------ |
| `code`     | ce qu'un client doit tester : stable, en majuscules, propre à la situation           |
| `type`     | le même code en URN (`urn:problem-type:<code-en-minuscules-avec-tirets>`)            |
| `status`   | statut HTTP, déduit de la catégorie de l'erreur                                      |
| `title`    | libellé standard du statut                                                           |
| `detail`   | message pour un développeur, en anglais ; ni stable ni à afficher tel quel           |
| `instance` | chemin de la requête, sans la query string (qui peut porter un secret)               |
| `errors`   | erreurs de validation seulement : `[{ path, message }]`, un élément par champ refusé |
| `details`  | données propres au code, quand il y en a (ex. les rôles requis pour `FORBIDDEN`)     |

Une erreur 5xx répond toujours `detail: "An unexpected error occurred."`, sans `details` : rien d'interne ne fuit. Elle est journalisée et envoyée à Sentry avec le `request_id`, à retrouver dans l'en-tête `x-request-id` de la réponse.

## Catégorie et statut

Le domaine ne connaît pas HTTP : chaque code a une catégorie (`ErrorKind`), et `ProblemDetailsFilter` en déduit le statut.

| Catégorie             | Statut | Sens                                                                        |
| --------------------- | ------ | --------------------------------------------------------------------------- |
| `VALIDATION`          | 400    | requête mal formée ; la corriger avant de réessayer                         |
| `UNAUTHENTICATED`     | 401    | token absent, invalide, expiré, ou sans tenant                              |
| `FORBIDDEN`           | 403    | route réservée à un autre rôle                                              |
| `NOT_FOUND`           | 404    | ressource inexistante, d'un autre tenant, ou qu'on n'a pas le droit de voir |
| `CONFLICT`            | 409    | écriture concurrente ou doublon ; relire puis réessayer                     |
| `PRECONDITION_FAILED` | 412    | `If-Match` ne correspond plus à la version courante                         |
| `BUSINESS_RULE`       | 422    | requête valide, refusée par une règle métier                                |
| `INTERNAL`            | 500    | bug ; jamais la faute du client                                             |

Un 404 ne distingue pas « n'existe pas » de « pas le droit de voir » : c'est voulu (voir [Multi-tenant et autorisations](../architecture/multi-tenant-et-autorisations.md#pourquoi-404-et-pas-403)).

## Codes hors `AppError`

Produits par le framework ou la validation, pour toutes les routes :

| Code                | Statut | Quand                                                                                       |
| ------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `VALIDATION_FAILED` | 400    | le corps, les paramètres ou la query ne respectent pas le schéma zod ; détail dans `errors` |
| `UNAUTHENTICATED`   | 401    | même code qu'une `AppError`, quand c'est Nest qui refuse                                    |
| `NOT_FOUND`         | 404    | aucune route ne correspond                                                                  |
| `TOO_MANY_REQUESTS` | 429    | rate limiting dépassé ; l'en-tête `Retry-After` dit quand réessayer                         |
| `INTERNAL_ERROR`    | 500    | exception inattendue qui n'est pas une `AppError`                                           |

Les autres exceptions HTTP de Nest prennent pour code le nom de leur statut (`PAYLOAD_TOO_LARGE`, `SERVICE_UNAVAILABLE`…).

## Codes de l'application

Générés depuis les tables `*_ERROR_KINDS` du code (`pnpm docs:errors`) : ne pas modifier cette partie à la main. `pnpm check` et la CI échouent si elle n'est plus à jour.

<!-- error-codes:start -->

### `api-core`

Source : `libs/api/core/src/lib/errors/app-error.ts`

| Code                          | Statut | Catégorie             | Signification                                                                                                                             |
| ----------------------------- | ------ | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `UNAUTHENTICATED`             | 401    | `UNAUTHENTICATED`     | Token absent, invalide, expiré, ou sans tenant.                                                                                           |
| `FORBIDDEN`                   | 403    | `FORBIDDEN`           | Route réservée à un autre rôle (`@RequireRole`) ; `details.required` liste les rôles admis.                                               |
| `FEATURE_DISABLED`            | 404    | `NOT_FOUND`           | Route derrière un flag désactivé : on ne révèle pas qu'elle existe.                                                                       |
| `INVALID_CURSOR`              | 400    | `VALIDATION`          | Curseur de pagination illisible ou forgé : repartir de la première page.                                                                  |
| `TENANT_CONTEXT_MISSING`      | 500    | `INTERNAL`            | Bug : tenant ou utilisateur lu hors d'une requête ou d'un handler.                                                                        |
| `OUTBOX_REQUIRES_TRANSACTION` | 500    | `INTERNAL`            | Bug : événement publié hors de la transaction de l'écriture métier.                                                                       |
| `INVALID_IF_MATCH`            | 400    | `VALIDATION`          | `If-Match` doit être un seul ETag, comme `"3"`.                                                                                           |
| `PRECONDITION_FAILED`         | 412    | `PRECONDITION_FAILED` | La ressource a changé depuis sa lecture (`If-Match`) : la relire avant de réessayer.                                                      |
| `IDEMPOTENCY_KEY_REQUIRED`    | 400    | `VALIDATION`          | Route de création sans en-tête `Idempotency-Key`.                                                                                         |
| `INVALID_IDEMPOTENCY_KEY`     | 400    | `VALIDATION`          | `Idempotency-Key` n'est pas un UUID.                                                                                                      |
| `IDEMPOTENCY_KEY_REUSED`      | 422    | `BUSINESS_RULE`       | Même `Idempotency-Key` pour une requête différente. 422, comme le recommande le brouillon IETF « The Idempotency-Key HTTP Header Field ». |

<!-- example:start -->

### `catalog`

Source : `libs/api/catalog/src/lib/domain/catalog.errors.ts`

| Code                       | Statut | Catégorie       | Signification                                                                          |
| -------------------------- | ------ | --------------- | -------------------------------------------------------------------------------------- |
| `PRODUCT_NOT_FOUND`        | 404    | `NOT_FOUND`     | Produit inexistant, d'un autre tenant, ou non publié pour un client.                   |
| `SKU_ALREADY_EXISTS`       | 409    | `CONFLICT`      | Le SKU est déjà pris dans le tenant.                                                   |
| `PRODUCT_VERSION_CONFLICT` | 409    | `CONFLICT`      | Deux écritures concurrentes sur le même produit : la seconde doit relire et réessayer. |
| `INVALID_PRICE`            | 400    | `VALIDATION`    | Prix négatif, non entier, ou nul pour un produit publié.                               |
| `PRODUCT_ARCHIVED`         | 422    | `BUSINESS_RULE` | Un produit archivé ne se modifie plus.                                                 |
| `PRODUCT_NOT_PUBLISHABLE`  | 422    | `BUSINESS_RULE` | Un produit à prix nul ne se publie pas.                                                |

<!-- example:end -->

<!-- example:start -->

### `orders`

Source : `libs/api/orders/src/lib/domain/orders.errors.ts`

| Code                     | Statut | Catégorie       | Signification                                                                             |
| ------------------------ | ------ | --------------- | ----------------------------------------------------------------------------------------- |
| `ORDER_NOT_FOUND`        | 404    | `NOT_FOUND`     | Commande inexistante, d'un autre tenant, ou d'un autre client (sauf pour le staff).       |
| `ORDER_VERSION_CONFLICT` | 409    | `CONFLICT`      | Deux écritures concurrentes (ex. deux annulations) : la seconde doit relire et réessayer. |
| `EMPTY_ORDER`            | 400    | `VALIDATION`    | Une commande a au moins une ligne.                                                        |
| `DUPLICATE_ORDER_LINE`   | 400    | `VALIDATION`    | Un produit n'apparaît qu'une fois par commande.                                           |
| `INVALID_ORDER_LINE`     | 400    | `VALIDATION`    | Quantité ou prix unitaire qui n'est pas un entier valide.                                 |
| `PRODUCT_UNAVAILABLE`    | 422    | `BUSINESS_RULE` | Produit inconnu, d'un autre tenant ou non publié : même réponse dans les trois cas.       |
| `CURRENCY_MISMATCH`      | 422    | `BUSINESS_RULE` | Tous les produits d'une commande ont la même devise.                                      |

<!-- example:end -->
<!-- error-codes:end -->

## Ajouter un code

Dans la table `<DOMAINE>_ERROR_KINDS` de `domain/<domaine>.errors.ts`, avec un commentaire `/** … */` quand le nom ne suffit pas : il devient la colonne « Signification ». Puis `pnpm docs:errors`.

Un code fait partie du contrat de l'API : le renommer, le supprimer ou changer sa catégorie casse les clients qui le testent. Un nouveau cas prend un nouveau code.

## Côté front

`web-data-access` lève une `ApiError` qui porte le problème complet (`status`, `code`, `errors`). Un écran choisit son message selon `code`, jamais selon `detail` ; les erreurs de validation se rattachent aux champs du formulaire par `path`. Voir [Référence : une lib feature du front](feature-web.md).
