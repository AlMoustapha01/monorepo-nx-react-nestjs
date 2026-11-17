import {
  AUDIT_ENTRY_ID_PREFIX,
  type AuditDetails,
  type AuditResource,
  domainIdGenerator,
  IDENTITY_AUDIT_ACTIONS,
} from '@nx-react-nestjs/contracts';
import { trace } from '@opentelemetry/api';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
// option:sentry:start
import { reportError } from './report-error';
// option:sentry:end

const newAuditEntryId = domainIdGenerator(AUDIT_ENTRY_ID_PREFIX);

/** Une ligne du journal d'audit (`audit.entries`, schéma de l'API, ADR 0015). */
export interface IdentityAuditEntry {
  tenantId: string;
  actorId: string;
  /** Opérateur qui agissait pour l'acteur, depuis une session impersonée (ADR 0019). */
  impersonatorId?: string;
  action: (typeof IDENTITY_AUDIT_ACTIONS)[keyof typeof IDENTITY_AUDIT_ACTIONS];
  resource: AuditResource;
  details: AuditDetails;
}

/** Ce qu'un hook `after` de Better Auth sait de la requête qui vient de réussir. */
export interface AuditedRequest {
  path: string;
  /** Session de l'appelant ; absente pour une connexion. */
  sessionUserId: string | undefined;
  /** Session créée par la requête (connexion, email vérifié) : elle porte l'organisation active. */
  newSession: { userId: string; activeOrganizationId: string | null } | undefined;
  /** Valeur rendue par l'endpoint ; une erreur (APIError) n'est jamais auditée. */
  returned: unknown;
  /** Corps de la requête, pour distinguer un changement de réglage d'une autre mise à jour. */
  body?: unknown;
}

interface Member {
  userId: string;
  organizationId: string;
  role: string;
}

const isMember = (value: unknown): value is Member =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Member).userId === 'string' &&
  typeof (value as Member).organizationId === 'string' &&
  typeof (value as Member).role === 'string';

/**
 * Chemins qui ouvrent une session : mot de passe, lien de vérification, fournisseur externe. Better Auth pose aussi
 * `newSession` quand il réécrit le cookie (changement d'organisation, rafraîchissement, profil) : ce n'est pas une connexion.
 */
const SIGN_IN_PATHS = [
  '/sign-in/',
  '/sign-up/',
  '/verify-email',
  '/callback/',
  '/oauth2/callback/',
  '/passkey/verify-authentication',
];
/** Second facteur : une connexion seulement sans session ouverte ; avec, l'utilisateur confirme sa 2FA. */
const SECOND_FACTOR_PATHS = ['/two-factor/verify-totp', '/two-factor/verify-backup-code'];
const isSignIn = (path: string, sessionUserId: string | undefined) =>
  SIGN_IN_PATHS.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix,
  ) ||
  (SECOND_FACTOR_PATHS.includes(path) && !sessionUserId);

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>)[key] : undefined;

/**
 * Traduit une requête réussie en lignes du journal. Jamais d'email ni de nom : des IDs et des rôles, qui ne
 * survivent pas en donnée personnelle à l'effacement d'une personne.
 */
export function identityAuditEntries(request: AuditedRequest): IdentityAuditEntry[] {
  const { path, sessionUserId: actorId, newSession, returned, body } = request;
  const entries: IdentityAuditEntry[] = [];

  if (newSession?.activeOrganizationId && isSignIn(path, actorId)) {
    entries.push({
      tenantId: newSession.activeOrganizationId,
      actorId: newSession.userId,
      action: IDENTITY_AUDIT_ACTIONS.signedIn,
      resource: { type: 'user', id: newSession.userId },
      details: { method: path.split('/').filter(Boolean).slice(0, 2).join('/') },
    });
  }
  if (!actorId) {
    return entries;
  }

  const member = (value: unknown, action: IdentityAuditEntry['action']) =>
    isMember(value) &&
    entries.push({
      tenantId: value.organizationId,
      actorId,
      action,
      resource: { type: 'member', id: value.userId },
      details: { role: value.role },
    });

  switch (path) {
    case '/organization/invite-member': {
      const id = field(returned, 'id');
      const organizationId = field(returned, 'organizationId');
      const role = field(returned, 'role');
      if (typeof id === 'string' && typeof organizationId === 'string') {
        entries.push({
          tenantId: organizationId,
          actorId,
          action: IDENTITY_AUDIT_ACTIONS.memberInvited,
          resource: { type: 'invitation', id },
          details: { role: typeof role === 'string' ? role : null },
        });
      }
      break;
    }
    case '/organization/accept-invitation':
      member(field(returned, 'member'), IDENTITY_AUDIT_ACTIONS.memberJoined);
      break;
    case '/organization/remove-member':
      member(field(returned, 'member'), IDENTITY_AUDIT_ACTIONS.memberRemoved);
      break;
    case '/organization/create':
    case '/organization/update': {
      // Création : seule une exigence posée d'emblée est un réglage à tracer.
      const requireTwoFactor =
        path === '/organization/create'
          ? field(returned, 'requireTwoFactor') === true || undefined
          : field(field(body, 'data'), 'requireTwoFactor');
      const id = field(returned, 'id');
      if (typeof requireTwoFactor === 'boolean' && typeof id === 'string') {
        entries.push({
          tenantId: id,
          actorId,
          action: IDENTITY_AUDIT_ACTIONS.twoFactorRequirementChanged,
          resource: { type: 'organization', id },
          details: { required: field(returned, 'requireTwoFactor') === true },
        });
      }
      break;
    }
    case '/organization/update-member-role':
      member(returned, IDENTITY_AUDIT_ACTIONS.memberRoleChanged);
      break;
  }
  return entries;
}

/**
 * Impersonation par un opérateur (ADR 0019) : une ligne dans chaque organisation du client, qui voit ainsi dans son
 * journal qui est entré dans son compte, et quand il en est sorti.
 */
export function impersonationAuditEntries(
  phase: 'started' | 'stopped',
  { operatorId, userId }: { operatorId: string; userId: string },
  organizationIds: readonly string[],
): IdentityAuditEntry[] {
  const action =
    phase === 'started'
      ? IDENTITY_AUDIT_ACTIONS.impersonationStarted
      : IDENTITY_AUDIT_ACTIONS.impersonationStopped;
  return organizationIds.map((tenantId) => ({
    tenantId,
    actorId: operatorId,
    action,
    resource: { type: 'user', id: userId },
    details: {},
  }));
}

/**
 * Écrit les lignes dans `audit.entries`, après l'action : une écriture qui échoue est journalisée et signalée,
 * jamais renvoyée à l'utilisateur, dont l'action a déjà eu lieu (ADR 0015).
 */
export function createAuditWriter(pool: Pool, logger: Logger) {
  return async (entries: readonly IdentityAuditEntry[]): Promise<void> => {
    const traceId = trace.getActiveSpan()?.spanContext().traceId ?? null;
    for (const entry of entries) {
      try {
        await pool.query(
          `insert into audit.entries
             (id, tenant_id, actor_id, impersonator_id, action, resource_type, resource_id, details,
              occurred_at, trace_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)`,
          [
            newAuditEntryId(),
            entry.tenantId,
            entry.actorId,
            entry.impersonatorId ?? null,
            entry.action,
            entry.resource.type,
            entry.resource.id,
            JSON.stringify(entry.details),
            traceId,
          ],
        );
      } catch (error) {
        logger.error(
          { err: error, action: entry.action, tenantId: entry.tenantId },
          'Audit entry lost',
        );
        // option:sentry:start
        reportError(error, { operation: 'audit' });
        // option:sentry:end
      }
    }
  };
}
