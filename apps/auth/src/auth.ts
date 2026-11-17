import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { jwt, organization } from 'better-auth/plugins';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import { createAccessRevoker } from './access-revocation';
import { createAuditWriter, identityAuditEntries } from './audit';
import { apiClaims } from './claims';
import type { AuthEnv } from './env';
import type { AuthEmail, SendEmail } from './mailer';
// option:sentry:start
import { reportError } from './report-error';
// option:sentry:end

/** En-tête interne : toute valeur envoyée par le client est remplacée par le serveur. */
export const CLIENT_IP_HEADER = 'x-auth-client-ip';

/** Schéma Postgres du service : aucune table partagée avec l'API. */
export const AUTH_SCHEMA = 'auth';

/** Attente maximum d'une connexion (pool plein ou Postgres injoignable) : la requête échoue au lieu de pendre. */
const CONNECTION_TIMEOUT_MS = 5_000;
/** Une transaction ouverte sans requête au-delà de ce délai est annulée : elle ne garde plus ses verrous. */
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

export function createPool(env: AuthEnv, logger: Logger): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    options: `-c search_path=${AUTH_SCHEMA}`,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    statement_timeout: env.DATABASE_STATEMENT_TIMEOUT_MS,
    idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
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
    sendEmail(email).catch((error: unknown) => {
      logger.error({ err: error, subject: email.subject }, 'Auth email failed');
      // option:sentry:start
      reportError(error, { operation: 'send-email' });
      // option:sentry:end
    });
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

  const writeAudit = createAuditWriter(pool, logger);
  const revoker = createAccessRevoker(pool, logger);
  /** Membres d'une organisation en cours de suppression, lus avant : sa fin les révoque à nouveau. */
  const membersOfDeleted = new Map<string, string[]>();
  const membersOf = async (organizationId: string) =>
    (
      await pool.query<{ userId: string }>(
        'select "userId" from member where "organizationId" = $1',
        [organizationId],
      )
    ).rows.map((row) => row.userId);

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
    onAPIError: {
      // Les refus attendus (mauvais mot de passe, session expirée…) sont des APIError 4xx : seules
      // les erreurs inattendues vont à Sentry.
      onError: (error) => {
        if (error instanceof APIError && error.statusCode < 500) {
          return;
        }
        logger.error({ err: error }, 'Unexpected auth error');
        // option:sentry:start
        reportError(error, { operation: 'api' });
        // option:sentry:end
      },
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
    hooks: {
      // Départ d'un membre : le plugin d'organisation n'a pas de hook pour lui (ADR 0016).
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/organization/leave') return;
        const organizationId = (ctx.body as { organizationId?: unknown } | undefined)
          ?.organizationId;
        const session = await getSessionFromCtx(ctx).catch(() => null);
        if (session && typeof organizationId === 'string') {
          await revoker.before(organizationId, [session.user.id]);
        }
      }),
      // Journal d'audit (ADR 0015) : après l'action, jamais à sa place ; une erreur n'est pas auditée.
      after: createAuthMiddleware(async (ctx) => {
        const { returned, newSession } = ctx.context;
        if (returned instanceof Error) {
          return;
        }
        if (ctx.path === '/organization/leave') {
          const left = returned as { userId?: unknown; organizationId?: unknown } | undefined;
          if (typeof left?.userId === 'string' && typeof left.organizationId === 'string') {
            await revoker.after(left.organizationId, [left.userId]);
          }
        }
        // Le contexte d'un hook `after` ne porte pas la session de l'appelant : relue depuis ses cookies.
        const session =
          !newSession && ctx.path.startsWith('/organization/')
            ? await getSessionFromCtx(ctx).catch(() => null)
            : null;
        await writeAudit(
          identityAuditEntries({
            path: ctx.path,
            sessionUserId: session?.user.id,
            newSession: newSession
              ? {
                  userId: newSession.user.id,
                  activeOrganizationId:
                    (newSession.session as { activeOrganizationId?: string | null })
                      .activeOrganizationId ?? null,
                }
              : undefined,
            returned,
          }),
        );
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
        // Révocation des accès (ADR 0016) : avant l'action, qui est refusée si elle ne s'écrit pas, puis à sa fin.
        organizationHooks: {
          beforeRemoveMember: ({ member }) =>
            revoker.before(member.organizationId, [member.userId]),
          afterRemoveMember: ({ member }) => revoker.after(member.organizationId, [member.userId]),
          beforeUpdateMemberRole: async ({ member }) => {
            await revoker.before(member.organizationId, [member.userId]);
          },
          afterUpdateMemberRole: ({ member }) =>
            revoker.after(member.organizationId, [member.userId]),
          beforeDeleteOrganization: async ({ organization: deleted }) => {
            const members = await membersOf(deleted.id);
            membersOfDeleted.set(deleted.id, members);
            await revoker.before(deleted.id, members);
          },
          // Les membres n'existent plus : ceux lus avant la suppression.
          afterDeleteOrganization: async ({ organization: deleted }) => {
            const members = membersOfDeleted.get(deleted.id) ?? [];
            membersOfDeleted.delete(deleted.id);
            await revoker.after(deleted.id, members);
          },
        },
        sendInvitationEmail: async ({ id, email, organization: invitedTo }) =>
          sendInBackground({
            to: email,
            subject: `Invitation à rejoindre ${invitedTo.name}`,
            text: `Pour rejoindre ${invitedTo.name} : ${new URL(`/invitations/${id}`, env.AUTH_APP_URL)}`,
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
