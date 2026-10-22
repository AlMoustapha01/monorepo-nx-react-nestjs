import { useQuery } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { toast } from 'sonner';
import { AccountMenu, sessionQueryOptions } from '@nx-react-nestjs/web-auth';
// example:start
import { StorefrontNav } from '@nx-react-nestjs/web-storefront';
// example:end
import { Stack } from '@nx-react-nestjs/web-ui';

// example:start
import { useFeatureFlag } from '../feature-flags';
// example:end
import { reloadForNewTenant, resetSession, ROOT_ROUTE } from '../session';

/** En-tête d'un utilisateur connecté : navigation métier et compte. */
export function AppNavigation() {
  const context = useRouteContext({ from: ROOT_ROUTE });
  const navigate = useNavigate();
  // example:start
  const storefront = useFeatureFlag('storefront');
  // example:end
  const { data: current } = useQuery({
    ...sessionQueryOptions(context.session.auth),
    enabled: !context.session.devMode,
  });

  return (
    <Stack direction="row" gap={4} align="center" wrap>
      {/* example:start */}
      {storefront && <StorefrontNav />}
      {/* example:end */}
      {current && (
        <AccountMenu
          auth={context.session.auth}
          session={current}
          onOrganizationChanged={async () => {
            // Une page de détail de l'ancien tenant n'existe pas dans le nouveau : retour à
            // l'accueil, puis rechargement de ses données.
            await navigate({ to: '/' });
            await reloadForNewTenant(context);
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
