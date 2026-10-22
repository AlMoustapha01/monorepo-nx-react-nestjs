import { createFileRoute } from '@tanstack/react-router';
import { OrdersPage } from '@nx-react-nestjs/web-storefront';

import { ErrorZone } from '../../../components/error-zone';
import { requireFeature } from '../../../feature-flags';

function Orders() {
  const { api } = Route.useRouteContext();
  return (
    <ErrorZone>
      <OrdersPage api={api} />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/(boutique)/commandes/')({
  beforeLoad: requireFeature('storefront'),
  component: Orders,
});
