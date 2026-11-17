import { passkey } from '@better-auth/passkey';
import { type BetterAuthPlugin, betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware, getSessionFromCtx } from 'better-auth/api';
import { jwt, organization, twoFactor } from 'better-auth/plugins';
import { Pool } from 'pg';
import type { Logger } from 'pino';
import { createAccessRevoker } from './access-revocation';
import { createAuditWriter, identityAuditEntries } from './audit';
import { apiClaims, PASSKEY_SIGN_IN_PATH } from './claims';
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
    const { rows } = await pool.query<{ role: string; requireTwoFactor: boolean | null }>(
      `select m.role, o."requireTwoFactor" from member m join organization o on o.id = m."organizationId"
       where m."userId" = $1 and m."organizationId" = $2`,
      [userId, organizationId],
    );
    return (
      rows[0] && {
        organizationId,
        role: rows[0].role,
        requireTwoFactor: rows[0].requireTwoFactor,
      }
    );
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

  /**
   * Accès que la 2FA conditionne (ADR 0017) : en exiger, c'est retirer l'accès aux membres sans 2FA ; désactiver la
   * sienne, c'est perdre l'accès aux organisations qui l'exigent. `undefined` : la requête n'en retire aucun.
   */
  const twoFactorRevocations = async (
    ctx: { path: string; body?: unknown },
    caller: { userId: string; activeOrganizationId: string | null | undefined },
  ): Promise<{ tenantId: string; userIds: string[] }[] | undefined> => {
    if (ctx.path === '/organization/update') {
      const body = ctx.body as { organizationId?: unknown; data?: { requireTwoFactor?: unknown } };
      const organizationId =
        typeof body?.organizationId === 'string'
          ? body.organizationId
          : caller.activeOrganizationId;
      if (body?.data?.requireTwoFactor !== true || !organizationId) return undefined;
      // Before passe avant le contrôle de droit de Better Auth : seul qui gère l'organisation révoque ses membres,
      // sinon n'importe quel compte couperait l'accès d'un tenant qu'il désigne.
      const callerRole = await pool.query<{ role: string }>(
        'select role from member where "userId" = $1 and "organizationId" = $2',
        [caller.userId, organizationId],
      );
      const manager = callerRole.rows[0]?.role
        .split(',')
        .some((role) => ['owner', 'admin'].includes(role.trim()));
      if (!manager) return undefined;
      const { rows } = await pool.query<{ userId: string }>(
        `select m."userId" from member m join "user" u on u.id = m."userId"
         where m."organizationId" = $1 and not coalesce(u."twoFactorEnabled", false)`,
        [organizationId],
      );
      return [{ tenantId: organizationId, userIds: rows.map((row) => row.userId) }];
    }
    if (ctx.path === '/two-factor/disable') {
      const { rows } = await pool.query<{ organizationId: string }>(
        `select m."organizationId" from member m join organization o on o.id = m."organizationId"
         where m."userId" = $1 and o."requireTwoFactor"`,
        [caller.userId],
      );
      return rows.map((row) => ({ tenantId: row.organizationId, userIds: [caller.userId] }));
    }
    return undefined;
  };

  /**
   * Journal d'audit (ADR 0015) et révocations à la fin de l'action : après l'action, jamais à sa place ; une erreur
   * n'est pas auditée. Dans un plugin placé après celui de la 2FA : un hook `after` global passe avant les plugins,
   * et verrait la session qu'ouvre le mot de passe, que la 2FA annule ensuite (ADR 0017).
   */
  const afterAction = createAuthMiddleware(async (ctx) => {
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
    // Pour le second facteur, son absence distingue la connexion de la confirmation d'une 2FA neuve.
    const session =
      ctx.path.startsWith('/two-factor/') || (!newSession && ctx.path.startsWith('/organization/'))
        ? await getSessionFromCtx(ctx).catch(() => null)
        : null;
    if (session) {
      const revocations = await twoFactorRevocations(ctx, {
        userId: session.user.id,
        activeOrganizationId: session.session.activeOrganizationId,
      });
      for (const { tenantId, userIds } of revocations ?? []) {
        await revoker.after(tenantId, userIds);
      }
    }
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
        body: ctx.body,
      }),
    );
  });

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
      // Exigence de 2FA et 2FA désactivée : révocations avant l'action (ADR 0017).
      before: createAuthMiddleware(async (ctx) => {
        if (
          ctx.path !== '/organization/leave' &&
          ctx.path !== '/organization/create' &&
          ctx.path !== '/organization/update' &&
          ctx.path !== '/two-factor/disable'
        ) {
          return;
        }
        const session = await getSessionFromCtx(ctx).catch(() => null);
        if (!session) return;
        if (ctx.path === '/organization/leave') {
          const organizationId = (ctx.body as { organizationId?: unknown } | undefined)
            ?.organizationId;
          if (typeof organizationId === 'string') {
            await revoker.before(organizationId, [session.user.id]);
          }
          return;
        }
        const body = ctx.body as
          | { requireTwoFactor?: unknown; data?: { requireTwoFactor?: unknown } }
          | undefined;
        const requiring =
          ctx.path === '/organization/create'
            ? body?.requireTwoFactor === true
            : ctx.path === '/organization/update' && body?.data?.requireTwoFactor === true;
        // Sans 2FA lui-même (ni session ouverte par passkey), celui qui l'exige perdrait aussitôt
        // l'accès à son organisation.
        if (
          requiring &&
          !(session.user as { twoFactorEnabled?: boolean | null }).twoFactorEnabled &&
          (session.session as { passkeySignIn?: boolean | null }).passkeySignIn !== true
        ) {
          throw new APIError('FORBIDDEN', {
            code: 'TWO_FACTOR_REQUIRED_FIRST',
            message: 'Enable two-factor authentication before requiring it',
          });
        }
        const revocations = await twoFactorRevocations(ctx, {
          userId: session.user.id,
          activeOrganizationId: session.session.activeOrganizationId,
        });
        for (const { tenantId, userIds } of revocations ?? []) {
          await revoker.before(tenantId, userIds);
        }
      }),
    },
    session: {
      additionalFields: {
        // Posé par le serveur seul, à la création de la session (hook ci-dessous).
        passkeySignIn: { type: 'boolean', required: false, defaultValue: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Une nouvelle session ouvre la première organisation de l'utilisateur : le token porte
          // un tenant dès la connexion. Une session qui en remplace une autre (2FA confirmée) garde
          // son organisation active, si l'utilisateur en est encore membre. Elle retient aussi si
          // elle a été ouverte par passkey : cela vaut la 2FA qu'une organisation exige (ADR 0018).
          before: async (session, context) => {
            const current = (session as { activeOrganizationId?: unknown }).activeOrganizationId;
            const { rows } = await pool.query<{ organizationId: string }>(
              `select "organizationId" from member where "userId" = $1
               order by ("organizationId" = $2) desc, "createdAt" limit 1`,
              [session.userId, typeof current === 'string' ? current : null],
            );
            const passkeySignIn =
              context?.path === PASSKEY_SIGN_IN_PATH ||
              (session as { passkeySignIn?: unknown }).passkeySignIn === true;
            return {
              data: {
                ...session,
                activeOrganizationId: rows[0]?.organizationId ?? null,
                passkeySignIn,
              },
            };
          },
        },
      },
    },
    // Second facteur : application d'authentification (TOTP) et codes de secours, pas de code par email (ADR 0017).
    disabledPaths: ['/two-factor/send-otp', '/two-factor/verify-otp'],
    plugins: [
      twoFactor({
        issuer: 'Shop',
        backupCodeOptions: { storeBackupCodes: 'encrypted' },
      }),
      // Passkeys (WebAuthn) : la cérémonie a lieu sur la page du front, dont l'origine et le
      // domaine font foi (ADR 0018).
      passkey({
        rpID: new URL(env.AUTH_APP_URL).hostname,
        rpName: 'Shop',
        origin: new URL(env.AUTH_APP_URL).origin,
      }),
      organization({
        schema: {
          organization: {
            additionalFields: {
              // Réglage de l'organisation : sans 2FA, un membre n'a pas accès à ce tenant (ADR 0017).
              requireTwoFactor: {
                type: 'boolean',
                required: false,
                defaultValue: false,
                input: true,
              },
            },
          },
        },
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
              session: { passkeySignIn: session['passkeySignIn'] === true },
            }),
        },
      }),
      // En dernier : ses hooks voient le résultat de ceux des autres plugins.
      {
        id: 'audit-and-revocation',
        hooks: { after: [{ matcher: () => true, handler: afterAction }] },
      } satisfies BetterAuthPlugin,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
