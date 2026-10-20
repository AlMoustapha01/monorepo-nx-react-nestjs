/**
 * Prépare l'environnement local : .env, Postgres, Redis, Mailpit, migrations.
 * Vérifie que les ports publiés par docker compose concordent avec les URLs de connexion,
 * et explique quoi changer quand un port est déjà pris sur la machine.
 */
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';

if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('.env créé depuis .env.example');
}
process.loadEnvFile('.env');

/** Chaque port publié par compose et l'URL que l'API utilise pour le joindre. */
const BINDINGS = [
  { portVar: 'POSTGRES_PORT', urlVar: 'DATABASE_URL', defaultPort: 5432 },
  { portVar: 'REDIS_PORT', urlVar: 'REDIS_URL', defaultPort: 6379 },
  { portVar: 'MAILPIT_SMTP_PORT', urlVar: 'SMTP_URL', defaultPort: 1025 },
] as const;

const PROTOCOL_DEFAULT_PORTS: Record<string, number> = {
  'postgres:': 5432,
  'postgresql:': 5432,
  'redis:': 6379,
  'smtp:': 25,
};

const mismatches = BINDINGS.flatMap(({ portVar, urlVar, defaultPort }) => {
  const raw = process.env[urlVar];
  if (!raw) {
    return [];
  }
  const url = new URL(raw);
  const urlPort = Number(url.port || PROTOCOL_DEFAULT_PORTS[url.protocol]);
  const published = Number(process.env[portVar] ?? defaultPort);
  return urlPort === published
    ? []
    : [`${urlVar} vise le port ${urlPort}, mais ${portVar}=${published}`];
});
if (mismatches.length > 0) {
  console.error(
    `Ports incohérents dans .env :\n  ${mismatches.join('\n  ')}\nAlignez-les puis relancez.`,
  );
  process.exit(1);
}

/** Lance une commande en affichant sa sortie ; renvoie son code et sa sortie d'erreur. */
function run(command: string, args: string[]): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['inherit', 'inherit', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on('close', (code) => resolve({ code: code ?? 1, stderr }));
  });
}

const compose = await run('docker', ['compose', 'up', '-d', '--wait']);
if (compose.code !== 0) {
  if (
    /port is already allocated|address already in use|ports are not available/i.test(compose.stderr)
  ) {
    console.error(`\n${busyPortHint(compose.stderr)}`);
  }
  process.exit(compose.code);
}

/** Docker indique le port en conflit (« Bind for 0.0.0.0:6379 failed ») : on nomme la variable. */
function busyPortHint(stderr: string): string {
  const port = Number(/:(\d+) failed/.exec(stderr)?.[1]);
  const published = [
    ...BINDINGS,
    { portVar: 'MAILPIT_UI_PORT', urlVar: undefined, defaultPort: 8025 },
  ];
  const binding = published.find(
    ({ portVar, defaultPort }) => Number(process.env[portVar] ?? defaultPort) === port,
  );
  if (!binding) {
    return (
      'Un port est déjà utilisé sur cette machine. Dans .env, changez le port concerné ' +
      '(POSTGRES_PORT, REDIS_PORT, MAILPIT_SMTP_PORT ou MAILPIT_UI_PORT) et son URL, puis relancez.'
    );
  }
  const url = binding.urlVar ? ` et le port de ${binding.urlVar}` : '';
  return `Le port ${port} est déjà utilisé sur cette machine. Dans .env, changez ${binding.portVar}${url}, puis relancez.`;
}

const migrate = await run('pnpm', ['nx', 'run', 'api:db-migrate']);
if (migrate.code !== 0) {
  process.exit(migrate.code);
}

console.log(`
Prêt.
  API      pnpm nx serve api → http://localhost:${process.env['PORT'] ?? '3000'}/api/v1
  Données  pnpm dev:seed (API démarrée)
  Token    pnpm -s dev:token
  Emails   http://localhost:${process.env['MAILPIT_UI_PORT'] ?? '8025'}`);
