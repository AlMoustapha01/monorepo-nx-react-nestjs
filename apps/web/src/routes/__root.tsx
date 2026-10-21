import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Trans } from '@lingui/react/macro';
import {
  Link,
  Outlet,
  createRootRouteWithContext,
  useMatch,
  useRouter,
} from '@tanstack/react-router';
import { Toaster } from 'sonner';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';
import { Button, Heading, Stack, Text, buttonVariants } from '@nx-react-nestjs/web-ui';

import { AppNavigation } from '../components/app-navigation';
import { LocaleSwitcher } from '../components/locale-switcher';
import { reportError } from '../report-error';
import { AUTHENTICATED_ROUTE, type SessionContext } from '../session';

export interface RouterContext {
  queryClient: QueryClient;
  api: ApiClient;
  session: SessionContext;
}

function RootLayout() {
  // Navigation et compte n'existent qu'une fois connecté (les flags exigent un token).
  const authenticated = useMatch({ from: AUTHENTICATED_ROUTE, shouldThrow: false });
  return (
    <>
      <header className="flex items-center justify-between gap-4 p-4">
        {authenticated ? <AppNavigation /> : <span />}
        <LocaleSwitcher />
      </header>
      <Stack as="main">
        <Outlet />
      </Stack>
      <Toaster />
    </>
  );
}

function GlobalError({ error }: { error: unknown }) {
  const router = useRouter();
  useEffect(() => reportError(error), [error]);
  return (
    <Stack role="alert">
      <Heading level={1}>
        <Trans>Une erreur est survenue</Trans>
      </Heading>
      <Text>
        <Trans>Quelque chose s'est mal passé. Vous pouvez réessayer.</Trans>
      </Text>
      <Button onClick={() => void router.invalidate()}>
        <Trans>Réessayer</Trans>
      </Button>
    </Stack>
  );
}

function NotFound() {
  return (
    <Stack>
      <Heading level={1}>
        <Trans>404 : page introuvable</Trans>
      </Heading>
      <Text>
        <Trans>Cette page n'existe pas.</Trans>
      </Text>
      <Link to="/" className={buttonVariants()}>
        <Trans>Retour à l'accueil</Trans>
      </Link>
    </Stack>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: GlobalError,
  notFoundComponent: NotFound,
});
