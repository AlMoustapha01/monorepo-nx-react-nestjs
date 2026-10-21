import { queryOptions, type DataTag, type UseSuspenseQueryOptions } from '@tanstack/react-query';
import {
  featureFlagsResponseSchema,
  type FeatureFlag,
  type FeatureFlagsResponse,
} from '@nx-react-nestjs/contracts';
import type { ApiClient } from './api-client';

type FeatureFlagsKey = readonly ['feature-flags'];
type FeatureFlagsQueryOptions = UseSuspenseQueryOptions<
  FeatureFlagsResponse,
  Error,
  FeatureFlagsResponse,
  FeatureFlagsKey
> & { queryKey: DataTag<FeatureFlagsKey, FeatureFlagsResponse, Error> };

/**
 * Flags exposés au front (`client: true`). Lus une fois par session ; en cas d'échec (hors
 * annulation), repli « tout coupé » et remontée de l'erreur via `onError`.
 */
export function featureFlagsQueryOptions(
  api: ApiClient,
  onError?: (error: unknown) => void,
): FeatureFlagsQueryOptions {
  return queryOptions({
    queryKey: ['feature-flags'] as const,
    staleTime: Infinity,
    queryFn: async ({ signal }): Promise<FeatureFlagsResponse> => {
      try {
        return await api.request('/feature-flags', { schema: featureFlagsResponseSchema, signal });
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') throw error;
        onError?.(error);
        return { flags: {} };
      }
    },
  });
}

export function isFeatureEnabled(data: FeatureFlagsResponse, flag: FeatureFlag): boolean {
  return data.flags[flag] === true;
}
