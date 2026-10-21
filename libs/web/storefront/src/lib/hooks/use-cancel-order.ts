import { useLingui } from '@lingui/react/macro';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { OrderResponse } from '@nx-react-nestjs/contracts';
import { ApiError, type ApiClient } from '@nx-react-nestjs/web-data-access';

import { storefrontKeys } from '../data/keys';
import { cancelOrder } from '../data/orders';

/** Annule une commande ; un conflit de version recharge la commande au lieu d'afficher une erreur générique. */
export function useCancelOrder(api: ApiClient): UseMutationResult<OrderResponse, Error, string> {
  const { t } = useLingui();
  const queryClient = useQueryClient();

  return useMutation<OrderResponse, Error, string>({
    mutationFn: (id) => cancelOrder(api, id),
    onSuccess: (order) => {
      queryClient.setQueryData(storefrontKeys.order(order.id), order);
      void queryClient.invalidateQueries({ queryKey: storefrontKeys.orders() });
    },
    onError: (error, id) => {
      if (error instanceof ApiError && error.code === 'ORDER_VERSION_CONFLICT') {
        void queryClient.invalidateQueries({ queryKey: storefrontKeys.order(id) });
        toast.error(t`La commande a changé entre-temps, elle a été rechargée.`);
        return;
      }
      toast.error(t`Une erreur est survenue.`);
    },
  });
}
