# 0008. Feature flags déclarés dans le code, surchargés par l'environnement

- **Statut** : Acceptée
- **Date** : 2026-10-21

## Contexte

Toute nouvelle fonctionnalité doit pouvoir être livrée désactivée, puis activée sans redéploiement de code, côté API comme côté front (principe 6). Un service de feature flags externe ajoute un fournisseur, un coût et une dépendance réseau dès le premier jour.

## Décision

- Les flags sont déclarés une fois dans les contrats (`FEATURE_FLAGS`), avec une description, une valeur par défaut et `client` (lisible par le front).
- Les valeurs se surchargent par la variable d'environnement `FEATURE_FLAGS` (`mon.flag=true,…`) ; un nom inconnu ou une valeur invalide empêche le démarrage.
- `FeatureFlags` est un port asynchrone, évalué pour la requête courante ; l'implémentation par défaut lit l'environnement.
- Une route derrière un flag coupé répond 404 (`FEATURE_DISABLED`), vérifié avant les rôles ; le front lit les flags `client` par `GET /api/v1/feature-flags`.

## Conséquences

- Les flags sont typés : une faute de frappe ne compile pas, et un flag supprimé du code disparaît partout.
- Activer un flag demande un redémarrage avec une nouvelle variable d'environnement, pas un clic : pas de ciblage par tenant ou par pourcentage.
- Le port permet de brancher plus tard un service (Unleash, LaunchDarkly…) ou un ciblage par tenant, sans toucher aux appelants.
- Un flag livré partout doit être supprimé ; sinon les branches mortes s'accumulent.
