import { useMutation } from '@tanstack/react-query';
import type {
  UseMutateAsyncFunction,
  UseMutateFunction,
  UseMutationOptions,
  UseMutationResult,
} from '@tanstack/react-query';
import { ApiError } from './api-error';

export interface IdempotentVariables<TInput> {
  input: TInput;
  idempotencyKey: string;
}

export type UseIdempotentMutationOptions<TData, TInput> = Omit<
  UseMutationOptions<TData, unknown, IdempotentVariables<TInput>>,
  'mutationFn'
> & {
  mutationFn: (input: TInput, idempotencyKey: string) => Promise<TData>;
  /**
   * Clé de chaque `mutate` (défaut : un UUID neuf). La fournir permet de la réutiliser
   * d'un clic à l'autre, après un échec ou un rechargement, tant que la requête est la même.
   */
  idempotencyKey?: (input: TInput) => string;
};

export type UseIdempotentMutationResult<TData, TInput> = Omit<
  UseMutationResult<TData, unknown, IdempotentVariables<TInput>>,
  'mutate' | 'mutateAsync'
> & {
  mutate: (
    input: TInput,
    options?: Parameters<UseMutateFunction<TData, unknown, IdempotentVariables<TInput>>>[1],
  ) => void;
  mutateAsync: (
    input: TInput,
    options?: Parameters<UseMutateAsyncFunction<TData, unknown, IdempotentVariables<TInput>>>[1],
  ) => Promise<TData>;
};

const MAX_MUTATION_RETRIES = 2;

/** Rejouer est sûr (même clé d'idempotence) : réseau, délai dépassé ou erreur serveur. */
function isRetryable(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.code === 'NETWORK_ERROR' || error.code === 'TIMEOUT' || error.status >= 500)
  );
}

/**
 * Mutation dont chaque `mutate` génère une `Idempotency-Key` (ou la demande à
 * `idempotencyKey`) ; les retries réutilisent les mêmes variables, donc la même clé.
 */
export function useIdempotentMutation<TData, TInput>(
  options: UseIdempotentMutationOptions<TData, TInput>,
): UseIdempotentMutationResult<TData, TInput> {
  const { mutationFn, idempotencyKey = () => crypto.randomUUID(), ...rest } = options;
  const mutation = useMutation<TData, unknown, IdempotentVariables<TInput>>({
    retry: (failureCount, error) => failureCount < MAX_MUTATION_RETRIES && isRetryable(error),
    ...rest,
    mutationFn: ({ input, idempotencyKey }) => mutationFn(input, idempotencyKey),
  });
  const { mutate, mutateAsync, ...state } = mutation;

  return {
    ...state,
    mutate: (input, opts) => mutate({ input, idempotencyKey: idempotencyKey(input) }, opts),
    mutateAsync: (input, opts) =>
      mutateAsync({ input, idempotencyKey: idempotencyKey(input) }, opts),
  };
}
