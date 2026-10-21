import { queryOptions } from '@tanstack/react-query';
import { orderSchema, type OrderResponse, type PlaceOrderInput } from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';

import { storefrontKeys } from './keys';

export function placeOrder(
  api: ApiClient,
  input: PlaceOrderInput,
  idempotencyKey: string,
): Promise<OrderResponse> {
  return api.request('/orders', {
    method: 'POST',
    body: input,
    idempotencyKey,
    schema: orderSchema,
  });
}

export function orderQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: storefrontKeys.order(id),
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      api.request(`/orders/${encodeURIComponent(id)}`, { schema: orderSchema, signal }),
  });
}

export function cancelOrder(api: ApiClient, id: string): Promise<OrderResponse> {
  return api.request(`/orders/${encodeURIComponent(id)}/cancel`, {
    method: 'POST',
    schema: orderSchema,
  });
}
