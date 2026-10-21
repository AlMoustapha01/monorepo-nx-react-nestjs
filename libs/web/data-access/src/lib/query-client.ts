import { MutationCache, QueryClient } from '@tanstack/react-query';
import { ApiError } from './api-error';

export interface QueryClientOptions {
  /** Appelé pour une mutation en échec sans `onError` propre (ex. afficher un toast). */
  onMutationError?: (error: unknown) => void;
}

const STALE_TIME_MS = 30_000;
const MAX_QUERY_RETRIES = 3;

/** Une requête annulée par l'appelant n'est ni une erreur à afficher ni à rejouer. */
function isAbortError(error: unknown): boolean {
  return (
    (error instanceof DOMException && error.name === 'AbortError') ||
    (error as { name?: string } | null)?.name === 'AbortError'
  );
}

export function createQueryClient(options: QueryClientOptions = {}): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        if (mutation.options.onError || isAbortError(error)) return;
        options.onMutationError?.(error);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: STALE_TIME_MS,
        retry: (failureCount, error) => {
          if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
          return failureCount < MAX_QUERY_RETRIES;
        },
      },
      mutations: { retry: 0 },
    },
  });
}
