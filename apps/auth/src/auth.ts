import { betterAuth } from 'better-auth';
import { jwt, organization } from 'better-auth/plugins';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import { apiClaims } from './claims';
import type { AuthEnv } from './env';
import type { AuthEmail, SendEmail } from './mailer';

/** En-tête interne : toute valeur envoyée par le client est remplacée par le serveur. */
export const CLIENT_IP_HEADER = 'x-auth-client-ip';

/** Schéma Postgres du service : aucune table partagée avec l'API. */
export const AUTH_SCHEMA = 'auth';

export function createPool(env: AuthEnv, logger: Logger): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    options: `-c search_path=${AUTH_SCHEMA}`,
  });
  // Sans écouteur, une connexion inactive coupée par Postgres fait planter le process.
  pool.on('error', (error) => logger.warn({ err: error }, 'Idle Postgres connection lost'));
  return pool;
}

interface AuthDependencies {
  env: AuthEnv;
  pool: Pool;
  sendEmail: SendEmail;
  logger: Logger;
}

export function createAuth({ env, pool, sendEmail, logger }: AuthDependencies) {
  // Pas d'attente : la réponse ne révèle pas, par sa durée, si un compte existe ; un SMTP lent ne
  // bloque pas la requête.
  const sendInBackground = (email: AuthEmail) => {
    sendEmail(email).catch((error: unknown) =>
      logger.error({ err: error, subject: email.subject }, 'Auth email failed'),
    );
  };

  /** Rôle du membre dans l'organisation active ; absent s'il n'en fait plus partie. */
  const membership = async (userId: string, organizationId: string | null | undefined) => {
    if (!organizationId) {
      return undefined;
    }
    const { rows } = await pool.query<{ role: string }>(
      'select role from member where "userId" = $1 and "organizationId" = $2',
      [userId, organizationId],
    );
    return rows[0] && { organizationId, role: rows[0].role };
  };

  return betterAuth({
    appName: 'Shop',
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: pool,
    trustedOrigins: env.CORS_ORIGINS,
    telemetry: { enabled: false },
    logger: {
      level: 'info',
      log: (level, message, ...args) => logger[level]({ args }, message),
    },
    // En base : partagé entre les instances, contrairement à la mémoire.
    rateLimit: { storage: 'database' },
    advanced: {
      // L'API attend des UUID pour `sub` et `tenant_id`.
      database: { generateId: 'uuid' },
      // Posé par le serveur (server.ts) à partir du socket : sans lui, tous les clients partagent
      // le même compteur anti-brute-force.
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) =>
        sendInBackground({
          to: user.email,
          subject: 'Réinitialisez votre mot de passe',
          text: `Pour choisir un nouveau mot de passe : ${url}`,
        }),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) =>
        sendInBackground({
          to: user.email,
          subject: 'Confirmez votre adresse email',
          text: `Pour confirmer votre adresse : ${url}`,
        }),
    },
    databaseHooks: {
      session: {
        create: {
          // Une nouvelle session ouvre la première organisation de l'utilisateur : le token porte
          // un tenant dès la connexion.
          before: async (session) => {
            const { rows } = await pool.query<{ organizationId: string }>(
              'select "organizationId" from member where "userId" = $1 order by "createdAt" limit 1',
              [session.userId],
            );
            return { data: { ...session, activeOrganizationId: rows[0]?.organizationId ?? null } };
          },
        },
      },
    },
    plugins: [
      organization({
        sendInvitationEmail: async ({ id, email, organization: invitedTo }) =>
          sendInBackground({
            to: email,
            subject: `Invitation à rejoindre ${invitedTo.name}`,
            text: `Pour rejoindre ${invitedTo.name} : ${new URL(`/accept-invitation/${id}`, env.AUTH_APP_URL)}`,
          }),
      }),
      // Access tokens pour l'API (`GET /api/auth/token`), clés publiques sur `/api/auth/jwks`.
      jwt({
        jwt: {
          issuer: env.AUTH_JWT_ISSUER,
          audience: env.AUTH_JWT_AUDIENCE,
          expirationTime: '15m',
          definePayload: async ({ user, session }) =>
            apiClaims({
              user,
              membership: await membership(user.id, session['activeOrganizationId']),
            }),
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
