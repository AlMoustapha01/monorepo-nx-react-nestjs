import {
  FEATURE_FLAGS,
  IDENTITY_AUDIT_ACTIONS,
  setTenantFeatureFlagSchema,
  type TenantFeatureFlags,
} from '@nx-react-nestjs/contracts';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import type { Pool } from 'pg';
import { z } from 'zod';
import type { createAuditWriter } from './audit';
import { requireOperator } from './operator-access';

/**
 * Flags d'un tenant au back-office (ADR 0020) : les surcharges de `feature_flags.tenant_overrides`, la table que lit
 * l'API (ADR 0014). La connexion ne pose pas de tenant : la RLS la laisse voir tous les tenants, comme pour l'audit.
 */
export function tenantFeatureFlagsEndpoints(
  pool: Pool,
  writeAudit: ReturnType<typeof createAuditWriter>,
) {
  async function describeTenant(organizationId: string): Promise<TenantFeatureFlags> {
    const { rows: organizations } = await pool.query<{ id: string; name: string }>(
      'select id, name from organization where id = $1',
      [organizationId],
    );
    const organization = organizations[0];
    if (!organization) {
      throw new APIError('NOT_FOUND', {
        code: 'ORGANIZATION_NOT_FOUND',
        message: 'No such organization',
      });
    }
    const { rows } = await pool.query<{ flag: string; enabled: boolean }>(
      'select flag, enabled from feature_flags.tenant_overrides where tenant_id = $1',
      [organizationId],
    );
    const overrides = new Map(rows.map((row) => [row.flag, row.enabled]));
    return {
      organization,
      flags: Object.entries(FEATURE_FLAGS).map(([flag, definition]) => ({
        flag,
        description: definition.description,
        catalogDefault: definition.default,
        override: overrides.get(flag) ?? null,
      })),
    };
  }

  return {
    operatorFeatureFlags: createAuthEndpoint(
      '/operator/feature-flags',
      {
        method: 'GET',
        query: z.object({ organizationId: z.uuid() }),
        use: [sessionMiddleware],
      },
      async (ctx) => {
        requireOperator(ctx.context.session);
        return ctx.json(await describeTenant(ctx.query.organizationId));
      },
    ),
    operatorSetFeatureFlag: createAuthEndpoint(
      '/operator/feature-flags',
      { method: 'POST', body: setTenantFeatureFlagSchema, use: [sessionMiddleware] },
      async (ctx) => {
        const { session } = ctx.context;
        // Ouvrir une fonctionnalité inachevée à un client touche à son compte : 2FA exigée, comme l'impersonation.
        requireOperator(session, { secondFactor: true });
        const { organizationId, flag, value } = ctx.body;
        await describeTenant(organizationId);
        if (value === 'default') {
          await pool.query(
            'delete from feature_flags.tenant_overrides where tenant_id = $1 and flag = $2',
            [organizationId, flag],
          );
        } else {
          await pool.query(
            `insert into feature_flags.tenant_overrides (tenant_id, flag, enabled, updated_at)
             values ($1, $2, $3, now())
             on conflict (tenant_id, flag) do update set enabled = excluded.enabled, updated_at = now()`,
            [organizationId, flag, value === 'on'],
          );
        }
        await writeAudit([
          {
            tenantId: organizationId,
            actorId: session.user.id,
            action: IDENTITY_AUDIT_ACTIONS.featureFlagChanged,
            resource: { type: 'organization', id: organizationId },
            details: { flag, value },
          },
        ]);
        return ctx.json(await describeTenant(organizationId));
      },
    ),
  };
}
