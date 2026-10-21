import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AccountMenu, sessionQueryOptions } from '@nx-react-nestjs/web-auth';
import { StorefrontNav } from '@nx-react-nestjs/web-storefront';
import { Stack } from '@nx-react-nestjs/web-ui';

import { useFeatureFlag } from '../feature-flags';
import { resetSession, ROOT_ROUTE } from '../session';

/** En-tête d'un utilisateur connecté : navigation métier et compte. */
export function AppNavigation() {
  const context = useRouteContext({ from: ROOT_ROUTE });
  const navigate = useNavigate();
  const storefront = useFeatureFlag('storefront');
  const { data: current } = useQuery({
    ...sessionQueryOptions(context.session.auth),
    enabled: !context.session.devMode,
  });

  return (
    <Stack direction="row" gap={4} align="center" wrap>
      {storefront && <StorefrontNav />}
      {current && (
        <AccountMenu
          auth={context.session.auth}
          session={current}
          onOrganizationChanged={async () => {
            resetSession(context);
            // Les pages ouvertes montraient les données de l'ancien tenant.
            await navigate({ to: '/' });
          }}
          onSignedOut={async () => {
            resetSession(context);
            await navigate({ to: '/connexion' });
          }}
          onError={(message) => toast.error(message)}
        />
      )}
    </Stack>
  );
}
