# Boutique : catalogue, panier, commande et annulation

Date : 2026-10-21
Précédent : [`2026-10-21-web-boilerplate-design.md`](2026-10-21-web-boilerplate-design.md) (socle front, qui renvoie à ce premier écran métier la définition des feature flags côté front).

## Intention

Premier écran métier du front. Un **client** parcourt le catalogue, remplit un panier, passe sa commande, la retrouve et peut l'annuler. L'API couvre déjà tout le parcours (catalogue, commandes, annulation) : ce travail est presque entièrement côté front, et il fixe au passage les conventions qui manquaient encore (feature flags côté front, première lib `type:feature`, état client persistant).

Le staff (gestion du catalogue, toutes les commandes du tenant) est hors sujet.

## Objectifs

1. **Catalogue** (page d'accueil quand le flag est actif) : grille de cartes des produits publiés (nom, SKU, prix), bouton « Ajouter au panier », indication « ✓ N dans le panier » sur la carte, bouton « Voir plus » pour la page suivante.
2. **En-tête** : liens « Mes commandes » et « Panier (N) » (N = somme des quantités), à côté du sélecteur de langue existant.
3. **Panier** (`/panier`) :
   - conservé dans le navigateur : le client retrouve son panier tel qu'il l'avait laissé après fermeture de l'onglet, le lendemain ;
   - quantité modifiable de 1 à 99 par ligne (stepper − / +), ligne supprimable ;
   - prix affichés = **prix actuels du catalogue**, relus à l'affichage, jamais ceux du moment de l'ajout ;
   - un produit qui n'est plus disponible (retiré, archivé, inconnu) apparaît grisé avec « Ce produit n'est plus disponible » ; tant qu'il reste dans le panier, « Passer la commande » est désactivé ;
   - total, bouton « Passer la commande ».
4. **Passer la commande** : une seule requête `POST /orders` avec toutes les lignes, sans doublon possible en cas de double clic ou de réseau instable (`useIdempotentMutation`). En cas de succès : panier vidé, navigation vers le récapitulatif.
5. **Récapitulatif** (`/commandes/$orderId`) : identifiant, badge de statut (« Passée » / « Annulée »), date, lignes (nom, quantité × prix unitaire **figé à la commande**, sous-total), total, bouton « Annuler la commande ».
6. **Annulation** : dialogue de confirmation (« Annuler cette commande ? Cette action est définitive. » — « Garder » / « Oui, annuler »). Après succès : badge « Annulée », plus de bouton. Le bouton n'existe que si le flag `orders.cancellation` est actif et que la commande est `placed`.
7. **Mes commandes** (`/commandes`) : liste des commandes du client (identifiant, date, badge de statut, total), plus récentes d'abord, « Voir plus », chaque ligne mène au récapitulatif.
8. **Feature flags côté front** : mécanisme défini ici (voir plus bas), nouveau flag `storefront` désactivé par défaut.

La maquette validée (wireframe des écrans 1 à 3) est dans `.superpowers/brainstorm/*/content/parcours.html` (non versionnée).

## Non-objectifs

- Aucun changement des routes de l'API catalogue ou commandes. Seul ajout côté API : la déclaration du flag `storefront`.
- Pas de panier côté serveur, pas de synchronisation du panier entre appareils.
- Pas de recherche, de filtre, de fiche produit dédiée, d'image produit, de stock (l'API n'en a pas).
- Pas d'écran staff, pas d'authentification front (le token de dev reste la seule source, comme aujourd'hui).
- Pas de paiement, pas de livraison.
- _(mon choix)_ Pas de Playwright dans ce lot, bien que ce soit le premier parcours critique : à faire dans un lot dédié ensuite.

## Anti-objectifs (échec même si « ça marche »)

- Une commande passée deux fois par un double clic ou un retry réseau.
- Un prix affiché dans le panier différent de celui que l'API facturera, faute d'avoir relu le catalogue.
- Un panier perdu au rechargement, ou une page qui plante parce que le contenu stocké est corrompu ou vient d'une ancienne version.
- Une commande qui échoue au clic sur « Passer la commande » pour une raison que le panier pouvait déjà montrer (produit indisponible).
- Un montant calculé ou affiché en flottant (`19.9`), ou mal formaté pour une devise sans décimales (XOF).
- Une chaîne visible en dur, un `fetch` hors data-access, un `<div>` stylé au lieu de `Stack`/`Text`/`Heading`.
- Une PR de plus de 500 lignes (hors catalogues Lingui et `routeTree.gen.ts`).

## Ce que l'API offre déjà (référence)

- `GET /catalog/products?limit&cursor` → `{items, nextCursor}` ; un client ne voit que `status: 'active'`. `GET /catalog/products/:id` → 404 `PRODUCT_NOT_FOUND` pour un produit non publié. Schémas : `productSchema`, `productPageSchema`, `moneySchema` (contracts). Devises : `EUR`, `USD`, `XOF`.
- `POST /orders` (`Idempotency-Key` obligatoire) body `{lines:[{productId, quantity}]}`, 1 à 50 lignes (`MAX_ORDER_LINES`), quantité 1 à 99 (`MAX_LINE_QUANTITY`), pas deux fois le même produit, une seule devise. Erreurs : `PRODUCT_UNAVAILABLE` (422, `details.productIds`), `CURRENCY_MISMATCH` (422), `DUPLICATE_ORDER_LINE`, `EMPTY_ORDER`, `INVALID_ORDER_LINE` (400).
- `GET /orders?limit&cursor` : un client ne reçoit que ses commandes. `GET /orders/:id` : 404 si ce n'est pas la sienne.
- `POST /orders/:id/cancel` : derrière `orders.cancellation` (404 `FEATURE_DISABLED` sinon), seul `placed → cancelled` change quelque chose, ré-annuler renvoie la commande telle quelle, une course peut donner 409 `ORDER_VERSION_CONFLICT`. Pas d'ETag sur les commandes.
- `GET /feature-flags` → `{flags: Record<string, boolean>}` (flags `client: true` seulement).
- Seed (`pnpm dev:seed`) : 4 produits publiés en EUR + 1 brouillon, aucune commande.

## Décisions prises avec l'utilisateur

- Cible : un client qui parcourt le catalogue pour commander.
- Commande via **un panier**, pas d'achat direct depuis une carte.
- Le panier **survit à la fermeture de l'onglet** (stockage navigateur).
- Après la commande : **le récapitulatif avec un bouton Annuler**.
- Les trois écrans de la maquette, l'en-tête avec « Mes commandes », le dialogue de confirmation, le bouton Annuler conditionné par `orders.cancellation` : validés.
- **Feature flags front** :
  - nouveau flag `storefront` dans `FEATURE_FLAGS` (contracts) : `default: false`, `client: true`, description « Boutique client : catalogue, panier, commandes. » ;
  - le front lit `GET /api/v1/feature-flags` une fois et garde le résultat en cache pour la session ;
  - flag coupé : les routes boutique répondent la page 404 existante, l'accueil reste la page actuelle ;
  - `orders.cancellation` est lu par le même mécanisme pour afficher ou non « Annuler » ;
  - en local : `FEATURE_FLAGS=storefront=true` dans `.env`.

## Choix laissés au builder, déjà tranchés par moi (à vérifier en relecture)

- **Lib** : une lib feature `libs/web/storefront` (`scope:web`, `type:feature`, alias `@nx-react-nestjs/web-storefront`), disposition `src/lib/{components,hooks,data,states}/`, `.oxlintrc.json` et `vitest.config.mts` comme décrit dans `libs/web/AGENTS.md`. Les routes restent des fichiers minces dans `apps/web/src/routes/` qui assemblent les composants de la lib.
- **URLs en français**, comme dans la maquette : `/`, `/panier`, `/commandes`, `/commandes/$orderId`.
- **Flags dans data-access** : `featureFlagsQueryOptions` (`staleTime: Infinity`) et un hook `useFeatureFlag(name: FeatureFlag)` dans `libs/web/data-access`, typé par `FeatureFlag` des contrats. Garde de route : `beforeLoad` qui fait `queryClient.ensureQueryData(featureFlagsQueryOptions(api))` et `throw notFound()` si `storefront` est faux. Pour `/`, le composant choisit entre le catalogue et la page actuelle selon le flag. Si l'appel des flags échoue : tous les flags valent `false` (repli sûr) et l'erreur passe par `reportError`. Comme `reportError` vit dans `apps/web` et qu'une lib ne peut pas importer l'app, data-access le reçoit en paramètre (callback), sur le modèle d'`onMutationError`.
- **Panier** : état client dans la lib (`states/`), persisté en `localStorage` sous la clé `app.cart`, contenu `{version: 1, lines: [{productId, name, quantity}]}`, validé par un schéma zod à la lecture (invalide ou absent → panier vide), lectures et écritures protégées par try/catch comme `app.locale`. Synchronisé entre onglets via l'événement `storage` (`useSyncExternalStore`). Le `name` est noté à l'ajout et ne sert **qu'à** nommer une ligne devenue indisponible (le 404 de l'API n'a pas de corps) ; pour une ligne disponible, nom et prix viennent toujours de l'API. Le panier ne stocke jamais de prix.
- **Prix du panier** : chaque ligne relit son produit par `GET /catalog/products/:id` (`productQueryOptions`, partagé avec le cache du catalogue). 404 → ligne « plus disponible ». Total = somme en unités mineures, en entier.
- **Limites dans l'UI** : bouton « Ajouter » d'un produit déjà présent → quantité +1 (pas de ligne en double), plafonné à 99 ; au-delà de 50 produits distincts, « Ajouter » est désactivé avec un message. Si les lignes du panier ont des devises différentes, « Passer la commande » est désactivé avec un message (évite `CURRENCY_MISMATCH`).
- **Erreurs à la commande** : `PRODUCT_UNAVAILABLE` → les produits de `details.productIds` sont marqués indisponibles dans le panier (invalidation de leurs requêtes) + message, pas de toast générique. Cela demande d'**ajouter `details` à `ApiError`** dans data-access (aujourd'hui non recopié). Autres erreurs : toast global existant.
- **Annulation** : `POST /orders/:id/cancel`, la réponse remplace la commande dans le cache et invalide la liste. `ORDER_VERSION_CONFLICT` → relecture de la commande, puis message. Ce n'est pas une création : `useMutation` simple, pas d'`Idempotency-Key`.
- **Pagination « Voir plus »** : `useInfiniteQuery` pour le catalogue et « Mes commandes », curseur **hors de l'URL**. Écart assumé à la règle « pagination dans les search params » de `libs/web/AGENTS.md` : sans filtre, un curseur dans l'URL ne permet pas d'afficher les pages accumulées. Taille de page : 20.
- **Montants** : un helper `formatMoney(money, locale)` dans la lib, `Intl.NumberFormat(locale, {style:'currency', currency})`, avec `amountMinor / 10 ** fractionDigits` où `fractionDigits` vient de `resolvedOptions().maximumFractionDigits` (0 pour XOF). Dates : `Intl.DateTimeFormat` de la locale active.
- **Pas de formulaire** : le stepper de quantité n'en est pas un ; react-hook-form reste non installé.
- **UI** : ajouter un composant `Badge` à `libs/web/ui` (story + export) pour le statut. Le reste avec `Card`, `Button`, `Dialog`, `Stack`, `Text`, `Heading`. Chargement : texte « Chargement… » (pas de squelette dans ce lot). Liste vide : « Aucun produit pour le moment », « Votre panier est vide » avec lien vers le catalogue, « Vous n'avez pas encore de commande ».
- **Zones d'erreur** : la grille du catalogue, le panier, le récapitulatif et la liste sont chacun dans un `ErrorZone`. `ErrorZone` vit dans `apps/web` : il enveloppe les composants de la lib depuis les fichiers de route.
- **Docs** : mettre à jour la section « Feature flags » d'`apps/web/AGENTS.md` (mécanisme et comment ajouter un flag front) et la retirer de « Différé volontairement » ; mentionner `FEATURE_FLAGS=storefront=true` dans `.env.example` en commentaire.

## Découpage en PR (chacune < 500 lignes, mon choix)

Découpage indicatif : si une PR dépasse 500 lignes tests compris (la 2 en particulier), la scinder (par exemple lib + état du panier, puis grille + en-tête).

1. **Flags** : flag `storefront` (contracts + test API existant si besoin), `featureFlagsQueryOptions` + `useFeatureFlag` dans data-access, `details` sur `ApiError`, doc `apps/web/AGENTS.md`.
2. **Catalogue + panier (état)** : lib `libs/web/storefront`, `formatMoney`, état du panier persistant, grille du catalogue, en-tête avec compteur, route `/` conditionnée.
3. **Page panier + commande** : `/panier`, relecture des prix, produits indisponibles, « Passer la commande », redirection.
4. **Commandes** : `Badge` dans ui, `/commandes/$orderId` avec annulation, `/commandes`.

## Tests attendus

- data-access : `useFeatureFlag` (flag vrai, faux, absent, appel en échec → faux), `ApiError.details` (MSW).
- storefront : état du panier (ajout, cumul, plafonds 99 / 50, suppression, persistance, contenu corrompu → vide, schéma d'une version inconnue → vide), `formatMoney` (EUR, XOF, fr/en).
- Composants avec MSW (jamais de mock de `fetch`) : catalogue (« Voir plus », « ✓ N dans le panier »), panier (prix actuel affiché, produit 404 grisé et commande bloquée, `PRODUCT_UNAVAILABLE` au moment de commander), commande passée → panier vidé + navigation, annulation (dialogue, badge « Annulée », bouton absent si flag coupé), route boutique → 404 quand `storefront` est faux.
- `web:i18n-check`, `web:size` (les routes boutique sont chargées à la demande : le JS initial ne doit pas bouger de façon notable).

## Vérification manuelle

```
# .env : FEATURE_FLAGS=storefront=true
pnpm nx serve api
pnpm dev:seed
VITE_DEV_TOKEN=$(pnpm -s dev:token) pnpm nx serve web
```

Parcours : ajouter 2 tee-shirts noirs et 1 mug, recharger la page (panier intact), commander, voir le récapitulatif, annuler, retrouver la commande « Annulée » dans « Mes commandes ». Puis retirer le flag : `/panier` répond 404 et l'accueil redevient la page actuelle.
