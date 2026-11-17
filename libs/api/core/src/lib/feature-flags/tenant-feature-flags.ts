import { Injectable } from '@nestjs/common';
import { type FeatureFlag, isFeatureFlag } from '@nx-react-nestjs/contracts';
import { eq } from 'drizzle-orm';
import { ClsService } from 'nestjs-cls';
import { AppConfig } from '../config/app-config';
import { RequestContext } from '../context/request-context';
import { DatabaseSession } from '../database/database-session';
import { ConfiguredFeatureFlags } from './feature-flags';
import { tenantFeatureFlags } from './tenant-feature-flags.schema';

type Overrides = Partial<Record<FeatureFlag, boolean>>;

/** Clé du contexte de la requête : les surcharges y sont lues une fois. */
const OVERRIDES_KEY = 'featureFlags:tenantOverrides';

interface CachedOverrides {
  tenantId: string;
  overrides: Promise<Overrides>;
}

/**
 * Valeur d'un flag pour le tenant courant : sa surcharge (`feature_flags.tenant_overrides`), sinon `FEATURE_FLAGS`,
 * sinon la valeur par défaut du catalogue (ADR 0014). Les surcharges du tenant sont lues une fois par requête, au
 * premier flag évalué : un changement s'applique à la requête suivante, sur toutes les instances.
 */
@Injectable()
export class TenantFeatureFlags extends ConfiguredFeatureFlags {
  constructor(
    config: AppConfig,
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
    private readonly cls: ClsService,
  ) {
    super(config);
  }

  override async isEnabled(flag: FeatureFlag): Promise<boolean> {
    const tenantId = this.context.principal?.tenantId;
    if (tenantId) {
      const override = (await this.overridesOf(tenantId))[flag];
      if (override !== undefined) {
        return override;
      }
    }
    return super.isEnabled(flag);
  }

  private overridesOf(tenantId: string): Promise<Overrides> {
    if (!this.cls.isActive()) {
      return this.load(tenantId);
    }
    const cached = this.cls.get<CachedOverrides | undefined>(OVERRIDES_KEY);
    if (cached?.tenantId === tenantId) {
      return cached.overrides;
    }
    const entry: CachedOverrides = { tenantId, overrides: this.load(tenantId) };
    this.cls.set(OVERRIDES_KEY, entry);
    // Une lecture en échec n'est pas gardée : le flag suivant de la requête réessaie.
    entry.overrides.catch(() => {
      if (this.cls.get(OVERRIDES_KEY) === entry) this.cls.set(OVERRIDES_KEY, undefined);
    });
    return entry.overrides;
  }

  private async load(tenantId: string): Promise<Overrides> {
    const rows = await this.session.db
      .select({ flag: tenantFeatureFlags.flag, enabled: tenantFeatureFlags.enabled })
      .from(tenantFeatureFlags)
      .where(eq(tenantFeatureFlags.tenantId, tenantId));
    // Un flag retiré du code peut garder des lignes : elles sont ignorées.
    return Object.fromEntries(
      rows.filter((row) => isFeatureFlag(row.flag)).map((row) => [row.flag, row.enabled]),
    );
  }
}
