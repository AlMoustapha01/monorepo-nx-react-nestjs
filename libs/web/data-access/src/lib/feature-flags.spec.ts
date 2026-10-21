import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { ApiError } from './api-error';
import { createApiClient } from './api-client';
import { featureFlagsQueryOptions, isFeatureEnabled } from './feature-flags';
import { createQueryClient } from './query-client';

const BASE = 'http://api.test/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createApiClient({ baseUrl: BASE });

describe('featureFlagsQueryOptions', () => {
  it('returns the flags from the API', async () => {
    server.use(
      http.get(`${BASE}/feature-flags`, () => HttpResponse.json({ flags: { storefront: true } })),
    );
    const data = await createQueryClient().fetchQuery(featureFlagsQueryOptions(api));
    expect(isFeatureEnabled(data, 'storefront')).toBe(true);
  });

  it('treats a missing flag as disabled', async () => {
    server.use(http.get(`${BASE}/feature-flags`, () => HttpResponse.json({ flags: {} })));
    const data = await createQueryClient().fetchQuery(featureFlagsQueryOptions(api));
    expect(isFeatureEnabled(data, 'orders.cancellation')).toBe(false);
  });

  it('falls back to all flags off and reports when the call fails', async () => {
    server.use(http.get(`${BASE}/feature-flags`, () => new HttpResponse(null, { status: 500 })));
    const onError = vi.fn<(error: unknown) => void>();
    const data = await createQueryClient().fetchQuery(featureFlagsQueryOptions(api, onError));
    expect(data).toEqual({ flags: {} });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(ApiError);
  });

  it('does not report nor cache the fallback when the request is aborted', async () => {
    server.use(
      http.get(`${BASE}/feature-flags`, async () => {
        await delay('infinite');
        return HttpResponse.json({ flags: {} });
      }),
    );
    const onError = vi.fn<(error: unknown) => void>();
    const queryClient = createQueryClient();
    const options = featureFlagsQueryOptions(api, onError);
    const pending = queryClient.fetchQuery(options).catch((error: unknown) => error);
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(1));
    await queryClient.cancelQueries({ queryKey: options.queryKey });
    await pending;
    expect(onError).not.toHaveBeenCalled();
    expect(queryClient.getQueryData(options.queryKey)).toBeUndefined();
  });
});
