import { type FeatureFlag, featureFlagSchema } from '@nx-react-nestjs/contracts';
import { z } from 'zod';

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

/** `orders.cancellation=false,autre.flag=true` : un nom inconnu ou une valeur invalide bloque le démarrage. */
const featureFlagOverrides = csv.pipe(
  z
    .array(
      z
        .string()
        .transform((entry) => entry.split('=').map((part) => part.trim()))
        .pipe(z.tuple([featureFlagSchema, z.stringbool()])),
    )
    .transform((entries): Partial<Record<FeatureFlag, boolean>> => Object.fromEntries(entries)),
);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),

  REDIS_URL: z.url(),
  /** false pour un process API sans relais ni worker (ex. workers déployés à part). */
  JOBS_ENABLED: z.stringbool().default(true),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  JOBS_CONCURRENCY: z.coerce.number().int().positive().default(5),

  /** Absent hors production : les emails sont seulement journalisés. */
  SMTP_URL: z.url().optional(),
  MAIL_FROM: z.string().min(3).default('Shop <no-reply@shop.local>'),

  /** Clés publiques du fournisseur d'identité (Better Auth : `<url>/api/auth/jwks`). Obligatoire en production. */
  AUTH_JWKS_URL: z.url().optional(),
  /** Dev et tests seulement, à la place du JWKS : secret HS256 partagé avec `dev:token`. */
  AUTH_JWT_SECRET: z.string().min(32).optional(),
  AUTH_JWT_ISSUER: z.string().min(1),
  AUTH_JWT_AUDIENCE: z.string().min(1),
  /** Claims portant le tenant et les rôles ; un chemin pointé descend dans un objet (`realm_access.roles`). */
  AUTH_TENANT_CLAIM: z.string().min(1).default('tenant_id'),
  AUTH_ROLES_CLAIM: z.string().min(1).default('roles'),

  /** Délai entre le signal d'arrêt et la fermeture, `/ready` en 503 : le temps que le load balancer retire l'instance. */
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().nonnegative().default(0),
  /** Au-delà, le process sort en erreur. Inférieur au délai avant SIGKILL de l'orchestrateur. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),

  CORS_ORIGINS: csv,
  RATE_LIMIT_TTL_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  /** Proxys de confiance devant l'API (load balancer : 1) : l'IP du client vient de X-Forwarded-For. */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),

  /** Surcharge les valeurs par défaut du catalogue (`FEATURE_FLAGS` des contrats). */
  FEATURE_FLAGS: featureFlagOverrides,
});

export type Env = z.infer<typeof envSchema>;

const checkedEnvSchema = envSchema
  .refine((env) => env.NODE_ENV !== 'production' || env.SMTP_URL !== undefined, {
    message: 'SMTP_URL is required in production',
    path: ['SMTP_URL'],
  })
  .refine((env) => (env.AUTH_JWKS_URL === undefined) !== (env.AUTH_JWT_SECRET === undefined), {
    message: 'Set exactly one of AUTH_JWKS_URL (identity provider) or AUTH_JWT_SECRET (dev, tests)',
    path: ['AUTH_JWKS_URL'],
  })
  // Un secret partagé permet de fabriquer des tokens : jamais en production.
  .refine((env) => env.NODE_ENV !== 'production' || env.AUTH_JWT_SECRET === undefined, {
    message: 'AUTH_JWT_SECRET is not allowed in production: use AUTH_JWKS_URL',
    path: ['AUTH_JWT_SECRET'],
  });

/** Appelé par ConfigModule : l'application refuse de démarrer si une variable est absente ou invalide. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = checkedEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
