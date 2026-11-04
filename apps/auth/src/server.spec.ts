import { createServer, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
import type { Auth } from './auth';
import { clientIp, createRequestListener } from './server';

const requestFrom = (remoteAddress: string, forwardedFor?: string) =>
  ({
    socket: { remoteAddress },
    headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
  }) as unknown as IncomingMessage;

describe('clientIp', () => {
  it('uses the socket address without a trusted proxy, even if the client sends X-Forwarded-For', () => {
    expect(clientIp(requestFrom('203.0.113.7', '198.51.100.1'), 0)).toBe('203.0.113.7');
  });

  it('walks back as many proxies as there are trusted proxies', () => {
    // Le client a forgé 198.51.100.1 ; le load balancer a ajouté la vraie adresse, 203.0.113.7.
    const request = requestFrom('10.0.0.2', '198.51.100.1, 203.0.113.7');
    expect(clientIp(request, 1)).toBe('203.0.113.7');
  });

  it('does not go past the start of the chain', () => {
    expect(clientIp(requestFrom('10.0.0.2', '203.0.113.7'), 5)).toBe('203.0.113.7');
  });
});

describe('createRequestListener', () => {
  it('logs an unexpected error of the auth handler and answers 500', async () => {
    const failure = new Error('connection terminated');
    const error = vi.fn();
    const server = createServer(
      createRequestListener({
        auth: { handler: () => Promise.reject(failure) } as unknown as Auth,
        pool: {} as Pool,
        corsOrigins: [],
        trustProxyHops: 0,
        isShuttingDown: () => false,
        logger: { error } as unknown as Logger,
      }),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/api/auth/get-session`);
      expect(response.status).toBe(500);
      expect(error).toHaveBeenCalledWith({ err: failure }, 'Unexpected auth server error');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
