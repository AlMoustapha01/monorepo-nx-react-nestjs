import { orderSchema, type OrderResponse, type PlaceOrderInput } from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';

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
