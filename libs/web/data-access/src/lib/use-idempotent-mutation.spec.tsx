// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ApiError } from './api-error';
import { createQueryClient } from './query-client';
import { useIdempotentMutation } from './use-idempotent-mutation';

function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={createQueryClient()}>{children}</QueryClientProvider>;
}

function apiError(status: number): ApiError {
  return new ApiError({ status, code: 'X', title: 't', detail: 'd' });
}

describe('useIdempotentMutation', () => {
  it('reuses the same key across retries', async () => {
    const mutationFn = vi
      .fn<(input: string, key: string) => Promise<string>>()
      .mockRejectedValueOnce(apiError(503))
      .mockResolvedValueOnce('ok');
    const { result } = renderHook(() => useIdempotentMutation({ mutationFn, retryDelay: 0 }), {
      wrapper,
    });

    act(() => result.current.mutate('x'));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mutationFn).toHaveBeenCalledTimes(2);
    const [first, second] = mutationFn.mock.calls;
    expect(first?.[1]).toBeTruthy();
    expect(first?.[1]).toBe(second?.[1]);
  });

  it('uses a new key for each mutate call', async () => {
    const mutationFn = vi
      .fn<(input: string, key: string) => Promise<string>>()
      .mockResolvedValue('ok');
    const { result } = renderHook(() => useIdempotentMutation({ mutationFn }), { wrapper });

    await act(() => result.current.mutateAsync('a'));
    await act(() => result.current.mutateAsync('b'));

    expect(mutationFn.mock.calls[0]?.[1]).not.toBe(mutationFn.mock.calls[1]?.[1]);
  });

  it('uses the key supplied by idempotencyKey', async () => {
    const mutationFn = vi
      .fn<(input: string, key: string) => Promise<string>>()
      .mockResolvedValue('ok');
    const { result } = renderHook(
      () => useIdempotentMutation({ mutationFn, idempotencyKey: (input) => `key-${input}` }),
      { wrapper },
    );

    await act(() => result.current.mutateAsync('a'));
    act(() => result.current.mutate('a'));
    await waitFor(() => expect(mutationFn).toHaveBeenCalledTimes(2));

    expect(mutationFn.mock.calls.map(([, key]) => key)).toEqual(['key-a', 'key-a']);
  });

  it('does not retry a 409', async () => {
    const mutationFn = vi
      .fn<(input: string, key: string) => Promise<string>>()
      .mockRejectedValue(apiError(409));
    const { result } = renderHook(() => useIdempotentMutation({ mutationFn, retryDelay: 0 }), {
      wrapper,
    });

    act(() => result.current.mutate('x'));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mutationFn).toHaveBeenCalledTimes(1);
  });
});
