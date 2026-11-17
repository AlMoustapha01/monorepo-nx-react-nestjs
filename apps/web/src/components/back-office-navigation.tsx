import { useQuery } from '@tanstack/react-query';
import { Trans } from '@lingui/react/macro';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AccountMenu, sessionQueryOptions } from '@nx-react-nestjs/web-auth';
import { Stack } from '@nx-react-nestjs/web-ui';

import { reloadForNewTenant, resetSession, ROOT_ROUTE } from '../session';

/**
 * En-tête du back-office : le compte de l'opérateur, sans la navigation d'un tenant, dont les flags exigent un
 * token avec tenant qu'un opérateur sans organisation n'a pas (ADR 0019).
 */
export function BackOfficeNavigation() {
  const context = useRouteContext({ from: ROOT_ROUTE });
  const navigate = useNavigate();
  const { data: current } = useQuery(sessionQueryOptions(context.session.auth));
  if (!current) return <span />;
  return (
    <Stack direction="row" gap={4} align="center" wrap>
      {/* La 2FA de l'opérateur, exigée pour voir un compte comme son utilisateur. */}
      <Link to="/securite" className="text-sm underline-offset-4 hover:underline">
        <Trans>Sécurité</Trans>
      </Link>
      <AccountMenu
        auth={context.session.auth}
        session={current}
        onOrganizationChanged={async () => {
          await navigate({ to: '/' });
          await reloadForNewTenant(context);
        }}
        onSignedOut={async () => {
          resetSession(context);
          await navigate({ to: '/connexion' });
        }}
        onError={(message) => toast.error(message)}
      />
    </Stack>
  );
}
