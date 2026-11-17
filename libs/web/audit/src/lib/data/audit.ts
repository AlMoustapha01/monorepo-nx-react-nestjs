import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { auditPageSchema } from '@nx-react-nestjs/contracts';
import type { ApiClient, AuthClient } from '@nx-react-nestjs/web-data-access';

import { auditKeys } from './keys';

/** Filtres de la page, portés par l'URL. */
export interface AuditFilters {
  action?: string;
  actorId?: string;
}

const PAGE_SIZE = 50;

export function auditEntriesInfiniteQueryOptions(api: ApiClient, filters: AuditFilters) {
  return infiniteQueryOptions({
    queryKey: auditKeys.entries(filters),
    staleTime: 30_000,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      api.request('/audit/entries', {
        query: { limit: PAGE_SIZE, cursor: pageParam, ...filters },
        schema: auditPageSchema,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
}

/** Membres de l'organisation : le journal ne garde que des IDs, la page affiche des noms. */
export function membersQueryOptions(auth: AuthClient) {
  return queryOptions({
    queryKey: auditKeys.members(),
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: ({ signal }) => auth.listMembers(signal),
  });
}
