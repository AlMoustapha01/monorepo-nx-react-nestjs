import { createFileRoute } from '@tanstack/react-router';
import { CartPage } from '@nx-react-nestjs/web-storefront';

import { ErrorZone } from '../../components/error-zone';
import { requireFeature } from '../../feature-flags';

function Cart() {
  const { api } = Route.useRouteContext();
  return (
    <ErrorZone>
      <CartPage api={api} />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/panier')({
  beforeLoad: requireFeature('storefront'),
  component: Cart,
});
