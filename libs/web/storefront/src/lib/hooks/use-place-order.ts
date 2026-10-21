import { useLingui } from '@lingui/react/macro';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import type { OrderResponse, PlaceOrderInput } from '@nx-react-nestjs/contracts';
import {
  ApiError,
  useIdempotentMutation,
  type ApiClient,
  type UseIdempotentMutationResult,
} from '@nx-react-nestjs/web-data-access';

import { storefrontKeys } from '../data/keys';
import { placeOrder } from '../data/orders';
import { clearCart } from '../states/cart';

export function isProductUnavailable(error: unknown): boolean {
  return error instanceof ApiError && error.code === 'PRODUCT_UNAVAILABLE';
}

function unavailableProductIds(error: ApiError): string[] {
  const ids = error.details?.['productIds'];
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
}

/** Passe la commande ; l'`Idempotency-Key` est générée par tentative et réutilisée par les retries. */
export function usePlaceOrder(
  api: ApiClient,
): UseIdempotentMutationResult<OrderResponse, PlaceOrderInput> {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useIdempotentMutation<OrderResponse, PlaceOrderInput>({
    mutationFn: (input, idempotencyKey) => placeOrder(api, input, idempotencyKey),
    onSuccess: async (order) => {
      clearCart();
      queryClient.setQueryData(storefrontKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: storefrontKeys.orders() });
      // Route ajoutée par une tâche suivante : cast temporaire, retiré par la tâche qui l'ajoute.
      await navigate({ to: '/commandes/$orderId' as '/', params: { orderId: order.id } as never });
    },
    onError: (error) => {
      if (error instanceof ApiError && isProductUnavailable(error)) {
        for (const id of unavailableProductIds(error)) {
          void queryClient.invalidateQueries({ queryKey: storefrontKeys.product(id) });
        }
        return;
      }
      toast.error(t`Une erreur est survenue.`);
    },
  });
}
