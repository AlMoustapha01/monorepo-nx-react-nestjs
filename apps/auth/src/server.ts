import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http';
import { toNodeHandler } from 'better-auth/node';
import type { Pool } from 'pg';
import { type Auth, CLIENT_IP_HEADER } from './auth';

interface ServerDependencies {
  auth: Auth;
  pool: Pool;
  corsOrigins: readonly string[];
  trustProxyHops: number;
  /** Vrai pendant l'arrêt : `/ready` répond 503 pour que le load balancer retire l'instance. */
  isShuttingDown: () => boolean;
}

/** Routes de Better Auth sous `/api/auth`, plus les sondes `/health` et `/ready`. */
export function createRequestListener({
  auth,
  pool,
  corsOrigins,
  trustProxyHops,
  isShuttingDown,
}: ServerDependencies): RequestListener {
  const handleAuth = toNodeHandler(auth);

  return (request, response) => {
    if (request.url === '/health') {
      return json(response, 200, { status: 'ok' });
    }
    if (request.url === '/ready') {
      if (isShuttingDown()) {
        return json(response, 503, { status: 'shutting down' });
      }
      pool.query('select 1').then(
        () => json(response, 200, { status: 'ok' }),
        () => json(response, 503, { status: 'database unavailable' }),
      );
      return;
    }
    if (!applyCors(request, response, corsOrigins)) {
      return;
    }
    const ip = clientIp(request, trustProxyHops);
    if (ip) {
      request.headers[CLIENT_IP_HEADER] = ip;
    } else {
      delete request.headers[CLIENT_IP_HEADER];
    }
    void handleAuth(request, response);
  };
}

/**
 * IP du client, comme Express avec `trust proxy` : chaque proxy de confiance ajoute à
 * X-Forwarded-For l'adresse qu'il voit ; au-delà de `trustedHops`, l'en-tête vient du client et
 * ne vaut rien.
 */
export function clientIp(request: IncomingMessage, trustedHops: number): string | undefined {
  const forwarded = String(request.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  const chain = [...forwarded, request.socket.remoteAddress];
  return chain[Math.max(0, chain.length - 1 - trustedHops)];
}

/** Le front appelle le service avec ses cookies : origine explicite, jamais `*`. Renvoie false si la requête est traitée. */
function applyCors(
  request: IncomingMessage,
  response: ServerResponse,
  origins: readonly string[],
): boolean {
  const origin = request.headers.origin;
  if (origin && origins.includes(origin)) {
    response.setHeader('access-control-allow-origin', origin);
    response.setHeader('access-control-allow-credentials', 'true');
    // Le plugin jwt renvoie aussi l'access token dans cet en-tête.
    response.setHeader('access-control-expose-headers', 'set-auth-jwt');
  }
  response.setHeader('vary', 'origin');
  if (request.method === 'OPTIONS') {
    response.setHeader('access-control-allow-methods', 'GET, POST');
    response.setHeader('access-control-allow-headers', 'content-type, authorization');
    response.statusCode = 204;
    response.end();
    return false;
  }
  return true;
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json');
  response.end(JSON.stringify(body));
}
