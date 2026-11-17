import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
import { organizationsQueryOptions } from '@nx-react-nestjs/web-auth';
// option:feature-flags:start
import { featureFlagsQueryOptions } from '@nx-react-nestjs/web-data-access';
// option:feature-flags:end

// option:feature-flags:start
import { reportError } from '../report-error';
// option:feature-flags:end
import { requireSession, SECURITY_PATH } from '../session';

/**
 * Pages de l'app : session et organisation active exigées (sans organisation, le token n'a pas
 * de tenant et l'API refuse tout). En mode dev (VITE_DEV_TOKEN), pas de vérification.
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.session.devMode) {
      const current = await requireSession(context, location.href);
      const activeId = current.session.activeOrganizationId;
      if (!activeId) {
        throw redirect({ to: '/organisations/nouvelle' });
      }
      // L'organisation exige la 2FA et le membre ne l'a pas : son token n'a pas de tenant (ADR 0017), l'API
      // refuserait tout. Seule la page de sécurité reste ouverte, sans flags ni appel à l'API.
      const organizations = await context.queryClient.fetchQuery(
        organizationsQueryOptions(context.session.auth),
      );
      const active = organizations.find((organization) => organization.id === activeId);
      // Une session ouverte par passkey vaut la 2FA (ADR 0018).
      if (
        active?.requireTwoFactor &&
        !current.user.twoFactorEnabled &&
        !current.session.passkeySignIn
      ) {
        if (location.pathname !== SECURITY_PATH) {
          throw redirect({ to: SECURITY_PATH });
        }
        // option:feature-flags:start
        context.queryClient.setQueryData(
          featureFlagsQueryOptions(context.api, reportError).queryKey,
          { flags: {} },
        );
        // option:feature-flags:end
        return { twoFactorDue: true };
      }
    }
    // option:feature-flags:start
    // Les flags sont chargés une fois, avant le premier rendu.
    await context.queryClient.ensureQueryData(featureFlagsQueryOptions(context.api, reportError));
    // option:feature-flags:end
    return { twoFactorDue: false };
  },
  component: Outlet,
});
