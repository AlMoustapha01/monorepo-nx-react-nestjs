import { ApiError } from './api-error';
import type { QueryClient } from '@tanstack/react-query';
import { createQueryClient } from './query-client';

function apiError(status: number): ApiError {
  return new ApiError({ status, code: 'X', title: 't', detail: 'd' });
}

async function runMutation(
  client: QueryClient,
  error: unknown,
  onError?: () => void,
): Promise<void> {
  await client
    .getMutationCache()
    .build(client, { mutationFn: () => Promise.reject(error), ...(onError ? { onError } : {}) })
    .execute(undefined)
    .catch(() => undefined);
}

describe('createQueryClient', () => {
  it('does not retry 4xx ApiError', async () => {
    const queryFn = vi.fn<() => Promise<never>>().mockRejectedValue(apiError(404));
    await expect(
      createQueryClient().fetchQuery({ queryKey: ['a'], queryFn, retryDelay: 0 }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it('retries 5xx up to 3 times', async () => {
    const queryFn = vi.fn<() => Promise<never>>().mockRejectedValue(apiError(503));
    await expect(
      createQueryClient().fetchQuery({ queryKey: ['b'], queryFn, retryDelay: 0 }),
    ).rejects.toBeInstanceOf(ApiError);
    expect(queryFn).toHaveBeenCalledTimes(4);
  });

  it('calls onMutationError for mutations without onError', async () => {
    const onMutationError = vi.fn<(error: unknown) => void>();
    const error = apiError(500);
    await runMutation(createQueryClient({ onMutationError }), error);
    expect(onMutationError).toHaveBeenCalledWith(error);
  });

  it('does not call it when the mutation has its own onError', async () => {
    const onMutationError = vi.fn<(error: unknown) => void>();
    const onError = vi.fn<() => void>();
    await runMutation(createQueryClient({ onMutationError }), apiError(500), onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onMutationError).not.toHaveBeenCalled();
  });

  it('ignores AbortError', async () => {
    const onMutationError = vi.fn<(error: unknown) => void>();
    await runMutation(
      createQueryClient({ onMutationError }),
      new DOMException('aborted', 'AbortError'),
    );
    expect(onMutationError).not.toHaveBeenCalled();
  });
});
