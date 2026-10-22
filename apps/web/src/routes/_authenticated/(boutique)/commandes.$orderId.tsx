import { createFileRoute, notFound } from '@tanstack/react-router';
import { orderIdSchema } from '@nx-react-nestjs/contracts';
import { ApiError } from '@nx-react-nestjs/web-data-access';
import { OrderPage, orderQueryOptions } from '@nx-react-nestjs/web-storefront';

import { ErrorZone } from '../../../components/error-zone';
import { requireFeature, useFeatureFlag } from '../../../feature-flags';

function Order() {
  const { api } = Route.useRouteContext();
  const { orderId } = Route.useParams();
  const canCancel = useFeatureFlag('orders.cancellation');
  return (
    <ErrorZone>
      <OrderPage api={api} orderId={orderId} canCancel={canCancel} />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/(boutique)/commandes/$orderId')({
  beforeLoad: requireFeature('storefront'),
  loader: async ({ context, params }) => {
    // L'API refuserait l'ID (400) : un lien mal formé est une page introuvable, pas une panne.
    if (!orderIdSchema.safeParse(params.orderId).success) throw notFound();
    try {
      await context.queryClient.ensureQueryData(orderQueryOptions(context.api, params.orderId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) throw notFound();
      throw error;
    }
  },
  component: Order,
});
