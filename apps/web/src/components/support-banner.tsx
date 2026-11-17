import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { ImpersonationBanner, sessionQueryOptions } from '@nx-react-nestjs/web-auth';

import { resetSession, ROOT_ROUTE } from '../session';

/** Bandeau d'une session impersonée, sur toutes les pages (ADR 0019). */
export function SupportBanner() {
  const context = useRouteContext({ from: ROOT_ROUTE });
  const navigate = useNavigate();
  const { data: current } = useQuery({
    ...sessionQueryOptions(context.session.auth),
    enabled: !context.session.devMode,
  });
  if (!current?.session.impersonatedBy) return null;
  return (
    <ImpersonationBanner
      auth={context.session.auth}
      session={current}
      onStopped={async () => {
        // Retour à l'opérateur : token et données du client oubliés.
        resetSession(context);
        await navigate({ to: '/support' });
      }}
    />
  );
}
