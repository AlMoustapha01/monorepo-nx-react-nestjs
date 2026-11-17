import { z } from 'zod';
import { domainIdSchema } from '../domain-id';
import { cursorPageQuerySchema, cursorPageSchema } from '../pagination';

/**
 * Journal d'audit : une ligne immuable par action (qui, quoi, sur quoi, quand), par tenant. Écrit par
 * les handlers d'événements de l'API et par le service d'identité ; lu par le staff du tenant (ADR 0015).
 */
export const AUDIT_ENTRY_ID_PREFIX = 'AUD';
export const auditEntryIdSchema = domainIdSchema(AUDIT_ENTRY_ID_PREFIX);

/** `<domaine>.<fait-au-passé>` : `identity.member-removed`, `orders.order-cancelled`. */
export const auditActionSchema = z
  .string()
  .max(100)
  .regex(/^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/, 'Expected <domain>.<past-tense-fact>');
export type AuditAction = z.infer<typeof auditActionSchema>;

/** Actions du service d'identité, écrites par ses hooks (apps/auth). */
export const IDENTITY_AUDIT_ACTIONS = {
  signedIn: 'identity.signed-in',
  memberInvited: 'identity.member-invited',
  memberJoined: 'identity.member-joined',
  memberRemoved: 'identity.member-removed',
  memberRoleChanged: 'identity.member-role-changed',
  twoFactorRequirementChanged: 'identity.two-factor-requirement-changed',
  /** Un opérateur de la plateforme voit l'application comme le client (back-office, ADR 0019). */
  impersonationStarted: 'identity.impersonation-started',
  impersonationStopped: 'identity.impersonation-stopped',
  // option:feature-flags:start
  /** Un opérateur change la valeur d'un flag pour le tenant (back-office, ADR 0020). */
  featureFlagChanged: 'identity.feature-flag-changed',
  // option:feature-flags:end
} as const satisfies Record<string, AuditAction>;

/** Ressource visée : un type stable (`order`, `member`) et son ID, quel qu'en soit le format. */
export const auditResourceSchema = z.object({
  type: z.string().min(1).max(50),
  id: z.string().min(1).max(100),
});
export type AuditResource = z.infer<typeof auditResourceSchema>;

/**
 * Détails d'une action : des valeurs simples (rôle, montant, nombre), jamais d'email ni de donnée
 * personnelle, qui survivraient à l'effacement de la personne.
 */
export const auditDetailsSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()]),
);
export type AuditDetails = z.infer<typeof auditDetailsSchema>;

export const auditEntrySchema = z.object({
  id: auditEntryIdSchema,
  /** Null pour une action du système (aucun utilisateur à l'origine). */
  actorId: z.uuid().nullable(),
  /** Opérateur de la plateforme qui agissait pour l'acteur (impersonation par le support). */
  impersonatorId: z.uuid().nullish(),
  action: auditActionSchema,
  resource: auditResourceSchema.nullable(),
  details: auditDetailsSchema,
  occurredAt: z.iso.datetime(),
  /** Trace OpenTelemetry de la requête d'origine : de la ligne du journal aux logs. */
  traceId: z.string().nullable(),
});
export type AuditEntryResponse = z.infer<typeof auditEntrySchema>;

export const auditPageQuerySchema = cursorPageQuerySchema.extend({
  actorId: z.uuid().optional(),
  action: auditActionSchema.optional(),
});
export type AuditPageQuery = z.infer<typeof auditPageQuerySchema>;

export const auditPageSchema = cursorPageSchema(auditEntrySchema);
