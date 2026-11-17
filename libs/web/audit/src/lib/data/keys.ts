import type { AuditFilters } from './audit';

export const auditKeys = {
  all: () => ['audit'] as const,
  entries: (filters: AuditFilters) => ['audit', 'entries', filters] as const,
  members: () => ['audit', 'members'] as const,
};
