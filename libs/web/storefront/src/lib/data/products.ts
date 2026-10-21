import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { productPageSchema, productSchema } from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';

import { storefrontKeys } from './keys';

export const PAGE_SIZE = 20;

export function productsInfiniteQueryOptions(api: ApiClient) {
  return infiniteQueryOptions({
    queryKey: storefrontKeys.products(),
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.request('/catalog/products', {
        query: { limit: PAGE_SIZE, cursor: pageParam },
        schema: productPageSchema,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

export function productQueryOptions(api: ApiClient, id: string) {
  return queryOptions({
    queryKey: storefrontKeys.product(id),
    staleTime: 30_000,
    queryFn: ({ signal }) =>
      api.request(`/catalog/products/${encodeURIComponent(id)}`, { schema: productSchema, signal }),
  });
}
