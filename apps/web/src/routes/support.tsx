import { createFileRoute, notFound, useNavigate } from '@tanstack/react-router';
import { OPERATOR_ROLE } from '@nx-react-nestjs/contracts';
import { BackOfficePage } from '@nx-react-nestjs/web-auth';

import { ErrorZone } from '../components/error-zone';
import { requireSession, resetSession } from '../session';

function BackOffice() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <ErrorZone>
      <BackOfficePage
        auth={context.session.auth}
        onImpersonated={async () => {
          // Session du client : token et données de l'opérateur oubliés.
          resetSession(context);
          await navigate({ to: '/' });
        }}
      />
    </ErrorZone>
  );
}

/**
 * Back-office des opérateurs de la plateforme (ADR 0019), hors des pages d'un tenant : un opérateur n'est membre
 * d'aucune organisation. Pour les autres, la page n'existe pas.
 */
export const Route = createFileRoute('/support')({
  beforeLoad: async ({ context, location }) => {
    if (context.session.devMode) throw notFound();
    const current = await requireSession(context, location.href);
    if (current.user.role !== OPERATOR_ROLE || current.session.impersonatedBy) throw notFound();
  },
  component: BackOffice,
});
