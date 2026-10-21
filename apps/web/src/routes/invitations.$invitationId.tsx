import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { AcceptInvitationPage } from '@nx-react-nestjs/web-auth';

import { requireSession, resetSession } from '../session';

function Invitation() {
  const context = Route.useRouteContext();
  const { invitationId } = Route.useParams();
  const navigate = useNavigate();
  return (
    <AcceptInvitationPage
      auth={context.session.auth}
      invitationId={invitationId}
      onAccepted={async () => {
        // L'organisation rejointe devient active : nouveau tenant, nouveau token.
        resetSession(context);
        await navigate({ to: '/' });
      }}
    />
  );
}

/** Lien de l'email d'invitation. Sans compte : connexion ou inscription, puis retour ici. */
export const Route = createFileRoute('/invitations/$invitationId')({
  beforeLoad: async ({ context, location }) => {
    await requireSession(context, location.href);
  },
  component: Invitation,
});
