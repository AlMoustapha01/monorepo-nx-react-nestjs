import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const REQUEST_ID_HEADER = 'x-request-id';

const VALID_REQUEST_ID = /^[\w-]{1,128}$/;

/**
 * Premier middleware de la chaîne : garantit un request id unique,
 * repris ensuite par le logger et par le contexte CLS.
 */
export function requestIdMiddleware(request: Request, response: Response, next: NextFunction) {
  const incoming = request.headers[REQUEST_ID_HEADER];
  const requestId =
    typeof incoming === 'string' && VALID_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  request.headers[REQUEST_ID_HEADER] = requestId;
  response.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function getRequestId(request: { headers: Record<string, unknown> }): string {
  return String(request.headers[REQUEST_ID_HEADER]);
}
