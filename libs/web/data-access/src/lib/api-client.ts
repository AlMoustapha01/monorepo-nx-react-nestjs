import { problemDetailsSchema } from '@nx-react-nestjs/contracts';
import type { z } from 'zod';
import { ApiError } from './api-error';

/** `refresh` : le token envoyé vient d'être refusé (401), il en faut un nouveau. */
export type GetToken = (options: {
  refresh: boolean;
}) => string | undefined | Promise<string | undefined>;

export interface ApiClientOptions {
  baseUrl: string;
  /** Token d'accès ; sur un 401, rappelé avec `refresh: true` et la requête est rejouée une fois. */
  getToken?: GetToken;
  /** Délai maximal d'une requête, 10 000 ms par défaut. */
  timeoutMs?: number;
}

export interface ApiRequest<T> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  schema?: z.ZodType<T>;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiClient {
  request<T>(path: string, init?: ApiRequest<T>): Promise<T>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export function createApiClient(options: ApiClientOptions): ApiClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request<T>(path: string, init: ApiRequest<T> = {}): Promise<T> {
    try {
      return await send(path, init, false);
    } catch (error) {
      // Token expiré ou révoqué : un seul nouvel essai, avec un token neuf. Un 401 n'a rien
      // exécuté côté serveur, le rejouer est sans risque (même Idempotency-Key).
      if (error instanceof ApiError && error.status === 401 && options.getToken) {
        return send(path, init, true);
      }
      throw error;
    }
  }

  async function send<T>(path: string, init: ApiRequest<T>, refresh: boolean): Promise<T> {
    const requestId = crypto.randomUUID();
    const headers = new Headers({
      accept: 'application/json, application/problem+json',
      'x-request-id': requestId,
    });
    const token = await options.getToken?.({ refresh });
    if (token) headers.set('authorization', `Bearer ${token}`);
    if (init.idempotencyKey) headers.set('idempotency-key', init.idempotencyKey);
    if (init.body !== undefined) headers.set('content-type', 'application/json');

    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;

    let response: Response;
    try {
      response = await fetch(buildUrl(options.baseUrl, path, init.query), {
        method: init.method ?? 'GET',
        headers,
        signal,
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      });
    } catch (error) {
      throw mapTransportFailure(error, init.signal, timeoutMs, requestId);
    }

    const effectiveRequestId = response.headers.get('x-request-id') ?? requestId;

    if (!response.ok) {
      throw await toApiError(response, effectiveRequestId, init.signal, timeoutMs);
    }
    if (response.status === 204) return undefined as T;

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      if (isAbortOrTimeout(error, init.signal)) {
        throw mapTransportFailure(error, init.signal, timeoutMs, effectiveRequestId);
      }
      throw new ApiError({
        status: response.status,
        code: 'INVALID_RESPONSE',
        title: 'Invalid response',
        detail: 'The response body is not valid JSON.',
        requestId: effectiveRequestId,
        cause: error,
      });
    }
    if (!init.schema) return payload as T;
    const parsed = init.schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError({
        status: response.status,
        code: 'INVALID_RESPONSE',
        title: 'Invalid response',
        detail: 'The response does not match the expected schema.',
        requestId: effectiveRequestId,
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  return { request };
}

function buildUrl(baseUrl: string, path: string, query: ApiRequest<unknown>['query']): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/** Corps vide ou non JSON (502 d'un proxy…) : repli sur HTTP_ERROR avec le status reçu. */
async function toApiError(
  response: Response,
  requestId: string,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
): Promise<ApiError> {
  let body: unknown;
  try {
    body = await response.json();
  } catch (error) {
    if (isAbortOrTimeout(error, callerSignal)) {
      throw mapTransportFailure(error, callerSignal, timeoutMs, requestId);
    }
  }
  const problem = problemDetailsSchema.safeParse(body);
  if (problem.success) {
    const { code, title, detail, errors, details } = problem.data;
    return new ApiError({
      status: response.status,
      code,
      title,
      detail,
      requestId,
      errors,
      details,
    });
  }
  return new ApiError({
    status: response.status,
    code: 'HTTP_ERROR',
    title: response.statusText || 'HTTP error',
    detail: `The server answered with status ${response.status}.`,
    requestId,
  });
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError';
}

function isAbortOrTimeout(error: unknown, callerSignal: AbortSignal | undefined): boolean {
  return callerSignal?.aborted === true || isTimeout(error);
}

/**
 * Mapping unique des échecs de transport (envoi ou lecture du corps) : l'annulation de l'appelant
 * est rethrow telle quelle, le timeout devient TIMEOUT, le reste NETWORK_ERROR.
 */
function mapTransportFailure(
  error: unknown,
  callerSignal: AbortSignal | undefined,
  timeoutMs: number,
  requestId: string,
): unknown {
  if (callerSignal?.aborted) return error;
  if (isTimeout(error)) {
    return new ApiError({
      status: 0,
      code: 'TIMEOUT',
      title: 'Timeout',
      detail: `No response within ${timeoutMs} ms.`,
      requestId,
      cause: error,
    });
  }
  return new ApiError({
    status: 0,
    code: 'NETWORK_ERROR',
    title: 'Network error',
    detail: 'The server could not be reached.',
    requestId,
    cause: error,
  });
}
