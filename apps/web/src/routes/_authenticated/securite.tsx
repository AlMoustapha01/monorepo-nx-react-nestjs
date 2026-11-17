import { createFileRoute } from '@tanstack/react-router';
import { SecurityPage } from '@nx-react-nestjs/web-auth';

import { ErrorZone } from '../../components/error-zone';
// option:feature-flags:start
import { requireFeature } from '../../feature-flags';
// option:feature-flags:end
import { reloadForNewTenant } from '../../session';

function Security() {
  const context = Route.useRouteContext();
  return (
    <ErrorZone>
      <SecurityPage
        auth={context.session.auth}
        // Accès du token changés (2FA, exigence de l'organisation) : nouveau token, données rechargées.
        onAccessChanged={() => reloadForNewTenant(context)}
      />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/securite')({
  beforeLoad: async (options) => {
    // Un membre que son organisation oblige à activer la 2FA y a accès, flag ou non.
    if (options.context.twoFactorDue) return;
    // option:feature-flags:start
    await requireFeature('account.two-factor')(options);
    // option:feature-flags:end
  },
  component: Security,
});
