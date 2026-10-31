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

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  AUTH_PORT: z.coerce.number().int().positive().default(3100),

  /** URL publique du service : liens des emails, origine des cookies. */
  BETTER_AUTH_URL: z.url(),
  /** Signe les cookies et chiffre les clés privées du JWKS. Généré, jamais commité. */
  BETTER_AUTH_SECRET: z.string().min(32),
  /** URL du front, pour les liens d'invitation. */
  AUTH_APP_URL: z.url(),
  /** Proxys devant le service (load balancer : 1) : l'IP du client est lue dans X-Forwarded-For. */
  TRUST_PROXY_HOPS: z.coerce.number().int().nonnegative().default(0),
  /** Origines du front autorisées à appeler le service (CORS, protection CSRF). */
  CORS_ORIGINS: csv,

  /** Délai entre le signal d'arrêt et la fermeture, `/ready` en 503 : le temps que le load balancer retire l'instance. */
  SHUTDOWN_DRAIN_MS: z.coerce.number().int().nonnegative().default(0),
  /** Au-delà, le process sort en erreur. Inférieur au délai avant SIGKILL de l'orchestrateur. */
  SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(25_000),

  /** Même base que l'API ; les tables de Better Auth vivent dans le schéma `auth`. */
  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(5),
  /** Durée maximum d'une requête SQL (`statement_timeout`) ; 0 la désactive. Ignoré par les migrations. */
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),

  /** Absent hors production : les emails sont seulement journalisés. */
  SMTP_URL: z.url().optional(),
  MAIL_FROM: z.string().min(3).default('Shop <no-reply@shop.local>'),

  /** Contrat avec l'API : mêmes valeurs que son AUTH_JWT_ISSUER et son AUTH_JWT_AUDIENCE. */
  AUTH_JWT_ISSUER: z.string().min(1),
  AUTH_JWT_AUDIENCE: z.string().min(1),
});

export type AuthEnv = z.infer<typeof envSchema>;

const checkedEnvSchema = envSchema.refine(
  (env) => env.NODE_ENV !== 'production' || env.SMTP_URL !== undefined,
  { message: 'SMTP_URL is required in production', path: ['SMTP_URL'] },
);

/** Le service refuse de démarrer si une variable est absente ou invalide. */
export function validateEnv(raw: Record<string, unknown>): AuthEnv {
  const result = checkedEnvSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
