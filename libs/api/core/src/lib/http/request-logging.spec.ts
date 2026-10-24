import type { IncomingMessage, ServerResponse } from 'node:http';
import pino from 'pino';
import { pinoHttp } from 'pino-http';
import request from 'supertest';
import { recordProblemCode, requestLoggingOptions } from './request-logging';

interface LogLine {
  level: number;
  msg: string;
  code?: string;
  responseTime?: number;
  reqId?: unknown;
  req?: { headers?: Record<string, unknown> };
  res?: { headers?: Record<string, unknown> };
}

function appLoggingAt(level: 'info' | 'debug') {
  const lines: LogLine[] = [];
  const stream = { write: (line: string) => lines.push(JSON.parse(line)) };
  const logger = pinoHttp({ ...requestLoggingOptions(level), logger: pino({ level }, stream) });
  const reply = (res: ServerResponse, status: number) => {
    res.statusCode = status;
    res.end('{}');
  };
  const app = (req: IncomingMessage, res: ServerResponse & { locals?: object }) => {
    logger(req, res);
    if (req.url?.startsWith('/ok')) {
      req.log.info('inside');
      return reply(res, 200);
    }
    if (req.url === '/conflict') {
      res.locals = {};
      recordProblemCode(res as never, 'IDEMPOTENCY_KEY_REUSED');
      return reply(res, 422);
    }
    return reply(res, 500);
  };
  return { app, lines };
}

const completion = (lines: LogLine[]) => lines.at(-1) as LogLine;

describe('requestLoggingOptions', () => {
  it('résume la requête dans le message : méthode, URL, statut', async () => {
    const { app, lines } = appLoggingAt('info');
    await request(app).get('/ok?limit=20').expect(200);

    expect(completion(lines).msg).toBe('GET /ok?limit=20 → 200');
    expect(completion(lines).responseTime).toEqual(expect.any(Number));
  });

  it('ne garde de la requête et de la réponse que l’essentiel, sans en-têtes', async () => {
    const { app, lines } = appLoggingAt('info');
    await request(app).get('/ok').set('User-Agent', 'curl').expect(200);

    const line = completion(lines);
    expect(line.req).toEqual({
      id: expect.any(Number),
      method: 'GET',
      url: '/ok',
      remoteAddress: expect.any(String),
    });
    expect(line.res).toEqual({ statusCode: 200 });
  });

  it('garde les en-têtes en debug, sans le token', async () => {
    const { app, lines } = appLoggingAt('debug');
    await request(app).get('/ok').set('Authorization', 'Bearer secret').expect(200);

    const line = completion(lines);
    expect(line.req?.headers).toMatchObject({ authorization: '[Redacted]' });
    expect(line.res?.headers).toEqual(expect.any(Object));
  });

  it('ajoute le code d’erreur au message et en champ filtrable', async () => {
    const { app, lines } = appLoggingAt('info');
    await request(app).post('/conflict').expect(422);

    const line = completion(lines);
    expect(line.msg).toBe('POST /conflict → 422 IDEMPOTENCY_KEY_REUSED');
    expect(line.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(line.level).toBe(40);
  });

  it('formate aussi une réponse 5xx', async () => {
    const { app, lines } = appLoggingAt('info');
    await request(app).get('/boom').expect(500);

    expect(completion(lines).msg).toBe('GET /boom → 500');
    expect(completion(lines).level).toBe(50);
  });

  it('ne rattache aux logs émis pendant la requête que son id', async () => {
    const { app, lines } = appLoggingAt('info');
    await request(app).get('/ok').expect(200);

    const inside = lines.find((line) => line.msg === 'inside');
    expect(inside).toMatchObject({ reqId: expect.anything() });
    expect(inside).not.toHaveProperty('req');
  });
});
