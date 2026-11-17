import { FEATURE_FLAGS, isFeatureFlag } from '@nx-react-nestjs/contracts';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { Database } from '../database/database.tokens';
import { tenantFeatureFlags } from './tenant-feature-flags.schema';

/** Ce que la commande affiche, et si elle a réussi (code de sortie). */
export interface FeatureFlagsCommandResult {
  ok: boolean;
  output: string;
}

export const FEATURE_FLAGS_USAGE = `Usage:
  feature-flags list [<tenantId>]                 overrides, for one tenant or all
  feature-flags set <flag> <tenantId> on|off      this value for this tenant, whatever FEATURE_FLAGS says
  feature-flags clear <flag> <tenantId>           back to FEATURE_FLAGS, then the catalog default`;

const tenantIdSchema = z.uuid();
const VALUES: Record<string, boolean> = { on: true, off: false };

const fail = (message: string): FeatureFlagsCommandResult => ({
  ok: false,
  output: `${message}\n\n${FEATURE_FLAGS_USAGE}`,
});

/**
 * Commande d'exploitation des surcharges par tenant (ADR 0014), sans HTTP : `node feature-flags.js` en production,
 * `pnpm dev:flag` en local. La connexion ne pose pas de tenant : la RLS ne la filtre pas, elle voit tous les tenants.
 */
export async function runFeatureFlagsCommand(
  db: Database,
  args: readonly string[],
  now = new Date(),
): Promise<FeatureFlagsCommandResult> {
  const [command, ...rest] = args;
  switch (command) {
    case 'list':
      return list(db, rest);
    case 'set':
      return set(db, rest, now);
    case 'clear':
      return clear(db, rest);
    default:
      return fail(command ? `Unknown command: ${command}` : 'Missing command');
  }
}

async function list(
  db: Database,
  [tenantId, ...extra]: string[],
): Promise<FeatureFlagsCommandResult> {
  if (extra.length > 0 || (tenantId !== undefined && !tenantIdSchema.safeParse(tenantId).success)) {
    return fail('Expected: list [<tenantId>]');
  }
  const rows = await db
    .select()
    .from(tenantFeatureFlags)
    .where(tenantId ? eq(tenantFeatureFlags.tenantId, tenantId) : undefined)
    .orderBy(asc(tenantFeatureFlags.tenantId), asc(tenantFeatureFlags.flag));
  if (rows.length === 0) {
    return { ok: true, output: 'No tenant override.' };
  }
  const lines = rows.map(
    (row) =>
      `${row.tenantId}  ${row.flag}  ${row.enabled ? 'on' : 'off'}  ${row.updatedAt.toISOString()}${
        isFeatureFlag(row.flag) ? '' : '  (not in the catalog: ignored, clear it)'
      }`,
  );
  return { ok: true, output: lines.join('\n') };
}

async function set(
  db: Database,
  [flag, tenantId, value, ...extra]: string[],
  now: Date,
): Promise<FeatureFlagsCommandResult> {
  if (!flag || !tenantId || !value || extra.length > 0) {
    return fail('Expected: set <flag> <tenantId> on|off');
  }
  if (!isFeatureFlag(flag)) {
    const known = Object.keys(FEATURE_FLAGS).join(', ') || 'none';
    return fail(`Unknown flag: ${flag} (catalog: ${known})`);
  }
  if (!tenantIdSchema.safeParse(tenantId).success) {
    return fail(`Invalid tenant id: ${tenantId} (expected a UUID)`);
  }
  const enabled = VALUES[value];
  if (enabled === undefined) {
    return fail(`Invalid value: ${value} (expected on or off)`);
  }
  await db
    .insert(tenantFeatureFlags)
    .values({ tenantId, flag, enabled, updatedAt: now })
    .onConflictDoUpdate({
      target: [tenantFeatureFlags.tenantId, tenantFeatureFlags.flag],
      set: { enabled, updatedAt: now },
    });
  return { ok: true, output: `${flag} is ${value} for tenant ${tenantId}.` };
}

async function clear(
  db: Database,
  [flag, tenantId, ...extra]: string[],
): Promise<FeatureFlagsCommandResult> {
  if (!flag || !tenantId || extra.length > 0) {
    return fail('Expected: clear <flag> <tenantId>');
  }
  if (!tenantIdSchema.safeParse(tenantId).success) {
    return fail(`Invalid tenant id: ${tenantId} (expected a UUID)`);
  }
  // Accepte un flag retiré du code : c'est ainsi qu'on nettoie ses lignes.
  const removed = await db
    .delete(tenantFeatureFlags)
    .where(and(eq(tenantFeatureFlags.tenantId, tenantId), eq(tenantFeatureFlags.flag, flag)))
    .returning({ flag: tenantFeatureFlags.flag });
  return {
    ok: true,
    output:
      removed.length > 0
        ? `${flag} no longer has an override for tenant ${tenantId}.`
        : `${flag} had no override for tenant ${tenantId}.`,
  };
}
