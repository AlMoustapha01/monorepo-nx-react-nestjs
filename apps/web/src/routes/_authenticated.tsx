import { Outlet, createFileRoute, redirect } from '@tanstack/react-router';
// option:feature-flags:start
import { featureFlagsQueryOptions } from '@nx-react-nestjs/web-data-access';
// option:feature-flags:end

// option:feature-flags:start
import { reportError } from '../report-error';
// option:feature-flags:end
import { requireSession } from '../session';

/**
 * Pages de l'app : session et organisation active exigées (sans organisation, le token n'a pas
 * de tenant et l'API refuse tout). En mode dev (VITE_DEV_TOKEN), pas de vérification.
 */
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ context, location }) => {
    if (!context.session.devMode) {
      const current = await requireSession(context, location.href);
      if (!current.session.activeOrganizationId) {
        throw redirect({ to: '/organisations/nouvelle' });
      }
    }
    // option:feature-flags:start
    // Les flags sont chargés une fois, avant le premier rendu.
    await context.queryClient.ensureQueryData(featureFlagsQueryOptions(context.api, reportError));
    // option:feature-flags:end
  },
  component: Outlet,
});
