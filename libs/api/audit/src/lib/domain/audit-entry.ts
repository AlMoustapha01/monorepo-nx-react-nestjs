import {
  type AuditDetails,
  auditActionSchema,
  auditDetailsSchema,
  type AuditResource,
  auditResourceSchema,
} from '@nx-react-nestjs/contracts';
import { AuditError } from './audit.errors';

export interface AuditEntryProps {
  id: string;
  tenantId: string;
  /** Null pour une action du système. */
  actorId: string | null;
  action: string;
  resource: AuditResource | null;
  details: AuditDetails;
  occurredAt: Date;
  traceId: string | null;
}

/** Une ligne du journal : écrite une fois, jamais modifiée ni supprimée par l'application. */
export class AuditEntry {
  private constructor(private readonly props: AuditEntryProps) {}

  static record(props: AuditEntryProps): AuditEntry {
    const checked =
      auditActionSchema.safeParse(props.action).success &&
      (props.resource === null || auditResourceSchema.safeParse(props.resource).success) &&
      auditDetailsSchema.safeParse(props.details).success;
    if (!checked) {
      throw new AuditError('INVALID_AUDIT_ENTRY', `Invalid audit entry for ${props.action}`, {
        action: props.action,
      });
    }
    return AuditEntry.restore(props);
  }

  /** Reconstruit une ligne depuis la persistance, sans rejouer les règles. */
  static restore(props: AuditEntryProps): AuditEntry {
    return new AuditEntry({
      ...props,
      resource: props.resource && { ...props.resource },
      details: { ...props.details },
    });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get actorId(): string | null {
    return this.props.actorId;
  }

  get action(): string {
    return this.props.action;
  }

  get resource(): AuditResource | null {
    return this.props.resource && { ...this.props.resource };
  }

  get details(): AuditDetails {
    return { ...this.props.details };
  }

  get occurredAt(): Date {
    return this.props.occurredAt;
  }

  get traceId(): string | null {
    return this.props.traceId;
  }
}
