import { type ChildProcess, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { GenericContainer, Wait } from 'testcontainers';

/** Ports fixes, propres aux e2e : la config Playwright (baseURL) est lue avant le démarrage. */
export const E2E_PORTS = {
  web: Number(process.env['E2E_WEB_PORT'] ?? 4310),
  api: Number(process.env['E2E_API_PORT'] ?? 3310),
  auth: Number(process.env['E2E_AUTH_PORT'] ?? 3110),
};

// Playwright compile la config et les tests en CommonJS : __dirname, pas import.meta.
const ROOT = resolve(__dirname, '../../..');
const LOGS = join(ROOT, 'dist/.playwright/apps/web-e2e/logs');

/** Ce que les tests lisent (process.env, transmis aux workers par Playwright). */
interface StackEnv {
  E2E_DATABASE_URL: string;
  E2E_MAILPIT_URL: string;
  E2E_AUTH_URL: string;
}

export interface Stack {
  env: StackEnv;
  stop(): Promise<void>;
}

/**
 * Démarre la stack comme en production : migrations en étape à part, puis les services compilés
 * (`nx build api auth`, dépendance de la cible e2e) et le front construit avec les URLs des e2e.
 * Les process tournent dans un dossier vide : un `.env` local ne peut pas s'en mêler.
 */
export async function startStack(): Promise<Stack> {
  mkdirSync(LOGS, { recursive: true });
  const cwd = mkdtempSync(join(tmpdir(), 'web-e2e-'));
  const processes: ChildProcess[] = [];
  const containers = await Promise.all([
    new PostgreSqlContainer('postgres:17-alpine').start(),
    new RedisContainer('redis:7-alpine').start(),
    new GenericContainer('axllent/mailpit:v1.31.3')
      .withExposedPorts(1025, 8025)
      .withWaitStrategy(Wait.forHttp('/readyz', 8025))
      .start(),
  ]);
  const [postgres, redis, mailpit] = containers;

  const stop = async () => {
    for (const child of processes) child.kill('SIGTERM');
    await Promise.all(containers.map((container) => container.stop()));
  };

  try {
    const web = `http://localhost:${E2E_PORTS.web}`;
    const authUrl = `http://localhost:${E2E_PORTS.auth}`;
    const contract = {
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
      DATABASE_URL: postgres.getConnectionUri(),
      SMTP_URL: `smtp://${mailpit.getHost()}:${mailpit.getMappedPort(1025)}`,
      AUTH_JWT_ISSUER: 'https://auth.e2e.local',
      AUTH_JWT_AUDIENCE: 'api',
      CORS_ORIGINS: web,
    };
    const apiEnv = {
      ...contract,
      PORT: String(E2E_PORTS.api),
      REDIS_URL: redis.getConnectionUrl(),
      AUTH_JWKS_URL: `${authUrl}/api/auth/jwks`,
      FEATURE_FLAGS: 'storefront=true',
      RATE_LIMIT_MAX: '10000',
    };
    const authEnv = {
      ...contract,
      AUTH_PORT: String(E2E_PORTS.auth),
      BETTER_AUTH_URL: authUrl,
      BETTER_AUTH_SECRET: randomBytes(32).toString('hex'),
      AUTH_APP_URL: web,
    };

    await Promise.all([
      run('api-migrate', ['node', join(ROOT, 'dist/apps/api/migrate.js')], apiEnv, cwd),
      run('auth-migrate', ['node', join(ROOT, 'dist/apps/auth/migrate.js')], authEnv, cwd),
      // Build de production : le token de dev (VITE_DEV_TOKEN) n'y existe pas.
      run(
        'web-build',
        ['pnpm', 'exec', 'vite', 'build', '--outDir', join(ROOT, 'dist/apps/web-e2e')],
        { VITE_API_URL: `http://localhost:${E2E_PORTS.api}/api/v1`, VITE_AUTH_URL: authUrl },
        join(ROOT, 'apps/web'),
      ),
    ]);

    processes.push(
      start('auth', ['node', join(ROOT, 'dist/apps/auth/main.js')], authEnv, cwd),
      start('api', ['node', join(ROOT, 'dist/apps/api/main.js')], apiEnv, cwd),
      start(
        'web',
        [
          'pnpm',
          'exec',
          'vite',
          'preview',
          '--outDir',
          join(ROOT, 'dist/apps/web-e2e'),
          '--port',
          String(E2E_PORTS.web),
          '--strictPort',
        ],
        {},
        join(ROOT, 'apps/web'),
      ),
    );
    await Promise.all([
      waitFor(`${authUrl}/ready`),
      waitFor(`http://localhost:${E2E_PORTS.api}/ready`),
      waitFor(web),
    ]);

    return {
      env: {
        E2E_DATABASE_URL: postgres.getConnectionUri(),
        E2E_MAILPIT_URL: `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}`,
        E2E_AUTH_URL: authUrl,
      },
      stop,
    };
  } catch (error) {
    await stop();
    throw error;
  }
}

function spawnLogged(name: string, command: string[], env: Record<string, string>, cwd: string) {
  const [bin = '', ...args] = command;
  const log = createWriteStream(join(LOGS, `${name}.log`));
  // PATH et HOME seulement : rien d'autre ne fuit de l'environnement du développeur.
  const child = spawn(bin, args, {
    cwd,
    env: { PATH: process.env['PATH'] ?? '', HOME: process.env['HOME'] ?? '', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  return child;
}

/** Commande qui doit se terminer avec succès (migration, build). */
function run(name: string, command: string[], env: Record<string, string>, cwd: string) {
  return new Promise<void>((done, fail) => {
    spawnLogged(name, command, env, cwd).on('exit', (code) =>
      code === 0 ? done() : fail(new Error(`${name} failed (${code}), see ${LOGS}/${name}.log`)),
    );
  });
}

/** Service qui tourne jusqu'à la fin des tests. */
function start(name: string, command: string[], env: Record<string, string>, cwd: string) {
  const child = spawnLogged(name, command, env, cwd);
  child.on('exit', (code, signal) => {
    if (signal !== 'SIGTERM') console.error(`${name} exited (${code ?? signal}), see ${LOGS}`);
  });
  return child;
}

async function waitFor(url: string, timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      // Pas encore prêt.
    }
    await new Promise((wait) => setTimeout(wait, 250));
  }
  throw new Error(`${url} not ready after ${timeoutMs} ms, see ${LOGS}`);
}
