import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Response } from 'express';
import type { Level } from 'pino';
import type { Options } from 'pino-http';

const PROBLEM_CODE = 'problemCode';

/** Note le code de la réponse d'erreur (RFC 9457) pour la ligne de log de la requête. */
export function recordProblemCode(response: Response, code: string): void {
  response.locals[PROBLEM_CODE] = code;
}

function problemCode(res: ServerResponse): string | undefined {
  return (res as Partial<Response>).locals?.[PROBLEM_CODE];
}

function summary(req: IncomingMessage, res: ServerResponse): string {
  const url = (req as { originalUrl?: string }).originalUrl ?? req.url;
  const code = problemCode(res);
  return `${req.method} ${url} → ${res.statusCode}${code ? ` ${code}` : ''}`;
}

interface SerializedRequest {
  id: unknown;
  method: string;
  url: string;
  remoteAddress?: string;
}

/**
 * Une ligne par requête, lisible d'un coup d'œil (`POST /api/v1/invoices → 422 IDEMPOTENCY_KEY_REUSED`) :
 * le message résume, le code d'erreur devient un champ filtrable, et les en-têtes (navigateur,
 * helmet, identiques d'une requête à l'autre) ne sont gardés qu'en debug.
 */
export function requestLoggingOptions(level: Level | 'silent'): Options {
  const verbose = level === 'debug' || level === 'trace';
  return {
    redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
    // Les logs émis pendant la requête ne portent que son id, pas toute la requête.
    quietReqLogger: true,
    // Le filtre ne journalise que les 5xx : les 4xx restent visibles ici, en warn.
    customLogLevel: (_req, res, error) =>
      error || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info',
    customSuccessMessage: summary,
    customErrorMessage: (req, res) => summary(req, res),
    customProps: (_req, res) => {
      const code = problemCode(res);
      return code ? { code } : {};
    },
    ...(!verbose && {
      serializers: {
        req: ({ id, method, url, remoteAddress }: SerializedRequest) => ({
          id,
          method,
          url,
          remoteAddress,
        }),
        res: ({ statusCode }: { statusCode: number }) => ({ statusCode }),
      },
    }),
  };
}
