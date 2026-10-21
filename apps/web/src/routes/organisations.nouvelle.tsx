import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { CreateOrganizationPage } from '@nx-react-nestjs/web-auth';

import { requireSession, resetSession } from '../session';

function NewOrganization() {
  const context = Route.useRouteContext();
  const navigate = useNavigate();
  return (
    <CreateOrganizationPage
      auth={context.session.auth}
      onCreated={async () => {
        // L'organisation créée est active : le prochain token porte son tenant.
        resetSession(context);
        await navigate({ to: '/' });
      }}
    />
  );
}

export const Route = createFileRoute('/organisations/nouvelle')({
  beforeLoad: async ({ context, location }) => {
    await requireSession(context, location.href);
  },
  component: NewOrganization,
});
