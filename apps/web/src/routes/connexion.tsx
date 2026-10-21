import { createFileRoute, redirect, useRouter } from '@tanstack/react-router';
import { z } from 'zod';
import { SignInPage } from '@nx-react-nestjs/web-auth';

import { appUrl, loadSession, resetSession, safeRedirect } from '../session';

function SignIn() {
  const context = Route.useRouteContext();
  const { redirect: target } = Route.useSearch();
  const router = useRouter();
  return (
    <SignInPage
      auth={context.session.auth}
      redirect={target}
      verificationCallbackUrl={appUrl(safeRedirect(target))}
      onSignedIn={async () => {
        resetSession(context);
        await router.navigate({ href: safeRedirect(target) });
      }}
    />
  );
}

export const Route = createFileRoute('/connexion')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  beforeLoad: async ({ context, search }) => {
    if (await loadSession(context)) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: SignIn,
});
