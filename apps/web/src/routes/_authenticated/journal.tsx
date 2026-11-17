import { createFileRoute } from '@tanstack/react-router';
import { auditActionSchema } from '@nx-react-nestjs/contracts';
import { AuditLogPage } from '@nx-react-nestjs/web-audit';
import { z } from 'zod';

import { ErrorZone } from '../../components/error-zone';
// option:feature-flags:start
import { requireFeature } from '../../feature-flags';
// option:feature-flags:end

/** Filtres du journal, dans l'URL : une valeur invalide est ignorée, pas une erreur. */
const searchSchema = z.object({
  action: auditActionSchema.optional().catch(undefined),
  actorId: z.uuid().optional().catch(undefined),
});

function AuditLog() {
  const { api, session } = Route.useRouteContext();
  const filters = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ErrorZone>
      <AuditLogPage
        api={api}
        auth={session.auth}
        filters={filters}
        onFiltersChange={(next) => void navigate({ search: next })}
      />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/journal')({
  validateSearch: searchSchema,
  // option:feature-flags:start
  beforeLoad: requireFeature('audit.log'),
  // option:feature-flags:end
  component: AuditLog,
});
