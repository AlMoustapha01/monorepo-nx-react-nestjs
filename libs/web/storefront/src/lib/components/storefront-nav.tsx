import { Trans } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { Stack, buttonVariants } from '@nx-react-nestjs/web-ui';

import { cartCount, useCart } from '../states/cart';

export function StorefrontNav() {
  const count = cartCount(useCart());
  return (
    <Stack as="nav" direction="row" gap={2} align="center">
      {/* Route ajoutée par une tâche suivante : cast temporaire pour le typage du routeur. */}
      <Link to={'/commandes' as '/'} className={buttonVariants({ variant: 'ghost' })}>
        <Trans>Mes commandes</Trans>
      </Link>
      <Link to="/panier" className={buttonVariants({ variant: 'ghost' })}>
        <Trans>Panier ({count})</Trans>
      </Link>
    </Stack>
  );
}
