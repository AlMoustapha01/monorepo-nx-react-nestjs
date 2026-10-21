import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import {
  orderPageSchema,
  orderSchema,
  type OrderResponse,
  type PlaceOrderInput,
} from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';

import { storefrontKeys } from './keys';
import { PAGE_SIZE } from './products';

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

export function ordersInfiniteQueryOptions(api: ApiClient) {
  return infiniteQueryOptions({
    queryKey: storefrontKeys.orders(),
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.request('/orders', {
        query: { limit: PAGE_SIZE, cursor: pageParam },
        schema: orderPageSchema,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}
