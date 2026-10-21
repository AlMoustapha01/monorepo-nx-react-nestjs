import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { z } from 'zod';
import { ApiError } from './api-error';
import { createApiClient } from './api-client';

const BASE = 'http://api.test/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.unstubAllGlobals();
});
afterAll(() => server.close());

/**
 * Remplace `fetch` par une réponse dont le corps démarre mais ne se termine jamais, et qui
 * échoue avec la raison du signal à son annulation (comme le fait undici). MSW n'est pas utilisé
 * ici : une coupure en plein corps déclenche une assertion interne d'undici via l'intercepteur.
 */
const stubStalledBody = (status = 200) => {
  vi.stubGlobal('fetch', (_url: unknown, init?: RequestInit) => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"a":'));
        init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
      },
    });
    return Promise.resolve(
      new Response(body, { status, headers: { 'content-type': 'application/json' } }),
    );
  });
};

const client = createApiClient({ baseUrl: BASE });
const catchError = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
};

describe('createApiClient', () => {
  it('copies problem details onto ApiError', async () => {
    server.use(
      http.post(`${BASE}/orders`, () =>
        HttpResponse.json(
          {
            type: 'urn:problem-type:PRODUCT_UNAVAILABLE',
            title: 'Unavailable',
            status: 422,
            detail: 'd',
            code: 'PRODUCT_UNAVAILABLE',
            details: { productIds: ['PRD-1'] },
          },
          { status: 422, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const error = await catchError(client.request('/orders', { method: 'POST', body: {} }));
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).details).toEqual({ productIds: ['PRD-1'] });
  });

  it('returns the parsed body validated by the schema', async () => {
    server.use(http.get(`${BASE}/products/1`, () => HttpResponse.json({ id: 'PRD-1' })));
    const result = await client.request('/products/1', {
      schema: z.object({ id: z.string() }),
    });
    expect(result).toEqual({ id: 'PRD-1' });
  });

  it('sends Authorization only when getToken returns a value', async () => {
    const seen: (string | null)[] = [];
    server.use(
      http.get(`${BASE}/me`, ({ request }) => {
        seen.push(request.headers.get('authorization'));
        return HttpResponse.json({});
      }),
    );
    let token: string | undefined = 'abc';
    const authed = createApiClient({ baseUrl: BASE, getToken: () => token });
    await authed.request('/me');
    token = undefined;
    await authed.request('/me');
    expect(seen).toEqual(['Bearer abc', null]);
  });

  it('sends a uuid x-request-id and exposes it on ApiError', async () => {
    let sent: string | null = null;
    server.use(
      http.get(`${BASE}/boom`, ({ request }) => {
        sent = request.headers.get('x-request-id');
        return new HttpResponse(null, { status: 502 });
      }),
    );
    const error = await catchError(client.request('/boom'));
    expect(sent).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).requestId).toBe(sent);
  });

  it('prefers the x-request-id of the response when present', async () => {
    server.use(
      http.get(`${BASE}/boom`, () =>
        HttpResponse.json(
          {
            type: 't',
            title: 'Internal Server Error',
            status: 500,
            code: 'INTERNAL_ERROR',
            detail: 'x',
          },
          { status: 500, headers: { 'x-request-id': 'server-id' } },
        ),
      ),
    );
    const error = await catchError(client.request('/boom'));
    expect((error as ApiError).requestId).toBe('server-id');
  });

  it('sends Idempotency-Key when given', async () => {
    let key: string | null = null;
    server.use(
      http.post(`${BASE}/orders`, ({ request }) => {
        key = request.headers.get('idempotency-key');
        return HttpResponse.json({});
      }),
    );
    await client.request('/orders', { method: 'POST', body: { a: 1 }, idempotencyKey: 'k-1' });
    expect(key).toBe('k-1');
  });

  it('sends a JSON body with content-type and accept headers', async () => {
    let seen: { type: string | null; accept: string | null; body: unknown } | undefined;
    server.use(
      http.post(`${BASE}/orders`, async ({ request }) => {
        seen = {
          type: request.headers.get('content-type'),
          accept: request.headers.get('accept'),
          body: await request.json(),
        };
        return HttpResponse.json({});
      }),
    );
    await client.request('/orders', { method: 'POST', body: { a: 1 } });
    expect(seen).toEqual({
      type: 'application/json',
      accept: 'application/json, application/problem+json',
      body: { a: 1 },
    });
  });

  it('serialises query params, skipping undefined values', async () => {
    let search = '';
    server.use(
      http.get(`${BASE}/products`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json({});
      }),
    );
    await client.request('/products', { query: { limit: 10, cursor: undefined, q: 'a b' } });
    expect(search).toBe('?limit=10&q=a+b');
  });

  it('maps problem+json to ApiError', async () => {
    server.use(
      http.get(`${BASE}/products/9`, () =>
        HttpResponse.json(
          {
            type: 'urn:problem-type:not-found',
            title: 'Not Found',
            status: 404,
            code: 'NOT_FOUND',
            detail: 'Product not found.',
            errors: [{ path: 'id', message: 'unknown' }],
          },
          { status: 404, headers: { 'content-type': 'application/problem+json' } },
        ),
      ),
    );
    const error = (await catchError(client.request('/products/9'))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
      title: 'Not Found',
      detail: 'Product not found.',
      errors: [{ path: 'id', message: 'unknown' }],
    });
  });

  it.each([
    ['an empty body', 502, () => new HttpResponse(null, { status: 502 })],
    [
      'an HTML body',
      500,
      () =>
        new HttpResponse('<html>oops</html>', {
          status: 500,
          headers: { 'content-type': 'text/html' },
        }),
    ],
  ])('maps %s to HTTP_ERROR', async (_label, status, respond) => {
    server.use(http.get(`${BASE}/x`, respond));
    const error = (await catchError(client.request('/x'))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.status).toBe(status);
  });

  it('throws INVALID_RESPONSE when the body fails the schema', async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.json({ id: 1 })));
    const error = (await catchError(
      client.request('/x', { schema: z.object({ id: z.string() }) }),
    )) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('INVALID_RESPONSE');
  });

  it('returns undefined on 204', async () => {
    server.use(http.delete(`${BASE}/x`, () => new HttpResponse(null, { status: 204 })));
    await expect(client.request('/x', { method: 'DELETE' })).resolves.toBeUndefined();
  });

  it('throws TIMEOUT after timeoutMs', async () => {
    server.use(
      http.get(`${BASE}/slow`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const fast = createApiClient({ baseUrl: BASE, timeoutMs: 50 });
    const error = (await catchError(fast.request('/slow'))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'TIMEOUT', status: 0 });
  });

  it('rethrows the caller AbortError untouched', async () => {
    server.use(
      http.get(`${BASE}/slow`, async () => {
        await delay('infinite');
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();
    const pending = catchError(client.request('/slow', { signal: controller.signal }));
    setTimeout(() => controller.abort(), 20);
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('rethrows an already aborted caller signal untouched', async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.json({})));
    const controller = new AbortController();
    controller.abort();
    const error = await catchError(client.request('/x', { signal: controller.signal }));
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('rethrows a custom abort reason untouched', async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.json({})));
    const reason = new Error('route changed');
    const controller = new AbortController();
    controller.abort(reason);
    const error = await catchError(client.request('/x', { signal: controller.signal }));
    expect(error).toBe(reason);
  });

  it('rethrows the caller AbortError when aborted during the body read', async () => {
    stubStalledBody();
    const controller = new AbortController();
    const pending = catchError(client.request('/stall', { signal: controller.signal }));
    setTimeout(() => controller.abort(), 30);
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('throws TIMEOUT when the body read exceeds timeoutMs', async () => {
    stubStalledBody();
    const fast = createApiClient({ baseUrl: BASE, timeoutMs: 50 });
    const error = (await catchError(fast.request('/stall'))) as ApiError;
    expect(error).toMatchObject({ code: 'TIMEOUT', status: 0 });
  });

  it('surfaces the caller AbortError when aborted while reading an error body', async () => {
    stubStalledBody(500);
    const controller = new AbortController();
    const pending = catchError(client.request('/stall', { signal: controller.signal }));
    setTimeout(() => controller.abort(), 30);
    const error = await pending;
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('throws INVALID_RESPONSE on a 200 with a non-JSON body', async () => {
    server.use(http.get(`${BASE}/x`, () => new HttpResponse('not json', { status: 200 })));
    const error = (await catchError(client.request('/x'))) as ApiError;
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', status: 200 });
  });

  it('maps a network failure to NETWORK_ERROR', async () => {
    server.use(http.get(`${BASE}/x`, () => HttpResponse.error()));
    const error = (await catchError(client.request('/x'))) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: 0 });
  });
});
