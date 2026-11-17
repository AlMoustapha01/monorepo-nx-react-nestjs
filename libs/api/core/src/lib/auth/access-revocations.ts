import { Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DatabaseSession } from '../database/database-session';
import { accessRevocations } from './access-revocations.schema';

const WARN_INTERVAL_MS = 60_000;

/**
 * Liste de révocation des accès (ADR 0016) : un token émis avant la révocation de son utilisateur dans son tenant
 * est refusé, sans attendre son expiration. Une lecture par clé primaire et par requête authentifiée.
 */
@Injectable()
export class AccessRevocations {
  private readonly logger = new Logger(AccessRevocations.name);
  private lastWarning = 0;

  constructor(private readonly session: DatabaseSession) {}

  /**
   * `issuedAt` : claim `iat`, à la seconde. Un token émis dans la seconde de la révocation est refusé : il peut l'avoir
   * précédée. Celui que le front redemande dans cette même seconde l'est donc aussi ; le suivant passe. Sans `iat`,
   * une révocation le refuse.
   * À appeler au nom du principal (RLS) ; si la liste est illisible, la requête passe : sans Postgres, les routes
   * qui touchent aux données échouent de toute façon.
   */
  async isRevoked(
    principal: { tenantId: string; userId: string },
    issuedAt: Date | undefined,
  ): Promise<boolean> {
    let revokedAt: Date | undefined;
    try {
      const [row] = await this.session.db
        .select({ revokedAt: accessRevocations.revokedAt })
        .from(accessRevocations)
        .where(
          and(
            eq(accessRevocations.tenantId, principal.tenantId),
            eq(accessRevocations.userId, principal.userId),
          ),
        );
      revokedAt = row?.revokedAt;
    } catch (error) {
      this.warn(error);
      return false;
    }
    if (!revokedAt) {
      return false;
    }
    if (!issuedAt) {
      return true;
    }
    return issuedAt.getTime() < (Math.floor(revokedAt.getTime() / 1000) + 1) * 1000;
  }

  private warn(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarning >= WARN_INTERVAL_MS) {
      this.lastWarning = now;
      this.logger.warn(
        { err: error },
        'Access revocations unreadable: tokens are not checked against them',
      );
    }
  }
}
