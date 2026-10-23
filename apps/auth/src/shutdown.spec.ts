import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { pino } from 'pino';
import { gracefulShutdown } from './shutdown';

const logger = pino({ level: 'silent' });

async function listening(): Promise<{ server: Server; url: string }> {
  const server = createServer((_request, response) => response.end('ok'));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return { server, url: `http://127.0.0.1:${port}` };
}

describe('gracefulShutdown', () => {
  let server: Server;
  let url: string;

  beforeEach(async () => {
    ({ server, url } = await listening());
  });

  afterEach(() => {
    server.close();
  });

  it('passe en arrêt dès le signal, mais sert encore pendant le drain', async () => {
    const exit = vi.fn<(code: number) => void>();
    const shutdown = gracefulShutdown({
      server,
      drainMs: 200,
      timeoutMs: 5000,
      close: async () => undefined,
      logger,
      exit,
    });

    void shutdown.start('SIGTERM');

    expect(shutdown.shuttingDown).toBe(true);
    const response = await fetch(url);
    expect(await response.text()).toBe('ok');
    expect(exit).not.toHaveBeenCalled();
  });

  it('ferme le serveur après le drain, puis les ressources, et sort en succès', async () => {
    const exit = vi.fn<(code: number) => void>();
    const close = vi.fn<() => Promise<void>>(async () => undefined);
    const shutdown = gracefulShutdown({
      server,
      drainMs: 50,
      timeoutMs: 5000,
      close,
      logger,
      exit,
    });

    await shutdown.start('SIGTERM');

    expect(server.listening).toBe(false);
    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(0);
  });

  it('sort en erreur si la fermeture dépasse le délai', async () => {
    const exit = vi.fn<(code: number) => void>();
    const shutdown = gracefulShutdown({
      server,
      drainMs: 0,
      timeoutMs: 50,
      close: () => sleep(500),
      logger,
      exit,
    });

    void shutdown.start('SIGTERM');
    await sleep(100);

    expect(exit).toHaveBeenCalledWith(1);
  });

  it('ignore un second signal', async () => {
    const exit = vi.fn<(code: number) => void>();
    const close = vi.fn<() => Promise<void>>(async () => undefined);
    const shutdown = gracefulShutdown({
      server,
      drainMs: 50,
      timeoutMs: 5000,
      close,
      logger,
      exit,
    });

    await Promise.all([shutdown.start('SIGTERM'), shutdown.start('SIGINT')]);

    expect(close).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledOnce();
  });
});
