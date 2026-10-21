import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { SignUpPage } from '@nx-react-nestjs/web-auth';

import { appUrl, loadSession, safeRedirect } from '../session';

function SignUp() {
  const { session } = Route.useRouteContext();
  const { redirect: target } = Route.useSearch();
  return (
    <SignUpPage
      auth={session.auth}
      redirect={target}
      // Le lien de confirmation ouvre la session et ramène ici : invitation en attente, ou
      // création de l'organisation.
      verificationCallbackUrl={appUrl(safeRedirect(target))}
    />
  );
}

export const Route = createFileRoute('/inscription')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    if (await loadSession(context)) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignUp,
});
