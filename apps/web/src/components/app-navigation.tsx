import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { Trans } from '@lingui/react/macro';
import { toast } from 'sonner';
import { AccountMenu, sessionQueryOptions } from '@nx-react-nestjs/web-auth';
// example:start
import { StorefrontNav } from '@nx-react-nestjs/web-storefront';
// example:end
import { OPERATOR_ROLE } from '@nx-react-nestjs/contracts';
import { Stack } from '@nx-react-nestjs/web-ui';

// option:feature-flags:start
import { useFeatureFlag } from '../feature-flags';
// option:feature-flags:end
import { reloadForNewTenant, resetSession, ROOT_ROUTE } from '../session';

/** En-tête d'un utilisateur connecté : navigation métier et compte. */
export function AppNavigation() {
  const context = useRouteContext({ from: ROOT_ROUTE });
  const navigate = useNavigate();
  // example:start
  const storefront = useFeatureFlag('storefront');
  // example:end
  // Sans feature flags (create:project), le lien est toujours là.
  const visible = { auditLog: true, security: true };
  // option:feature-flags:start
  visible.auditLog = useFeatureFlag('audit.log');
  visible.security = useFeatureFlag('account.two-factor');
  // option:feature-flags:end
  const { data: current } = useQuery({
    ...sessionQueryOptions(context.session.auth),
    enabled: !context.session.devMode,
  });

  return (
    <Stack direction="row" gap={4} align="center" wrap>
      {/* example:start */}
      {storefront && <StorefrontNav />}
      {/* example:end */}
      {visible.auditLog && (
        <Link to="/journal" className="text-sm underline-offset-4 hover:underline">
          <Trans>Journal d’audit</Trans>
        </Link>
      )}
      {visible.security && (
        <Link to="/securite" className="text-sm underline-offset-4 hover:underline">
          <Trans>Sécurité</Trans>
        </Link>
      )}
      {current?.user.role === OPERATOR_ROLE && !current.session.impersonatedBy && (
        <Link to="/support" className="text-sm underline-offset-4 hover:underline">
          <Trans>Back-office</Trans>
        </Link>
      )}
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
