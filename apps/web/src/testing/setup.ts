import { configure } from '@testing-library/react';

// Les tests de l'app rendent l'app entière (routeur, requêtes simulées) : sur une CI chargée, la
// première page dépasse le délai par défaut de 1 s des `findBy…` et `waitFor`.
configure({ asyncUtilTimeout: 5_000 });
