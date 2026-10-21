import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Link, Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';
import { Button, Heading, Stack, Text, buttonVariants } from '@nx-react-nestjs/web-ui';

import { reportError } from '../report-error';

export interface RouterContext {
  queryClient: QueryClient;
  api: ApiClient;
}

function RootLayout() {
  return (
    <>
      <Outlet />
      <Toaster />
    </>
  );
}

function GlobalError({ error }: { error: unknown }) {
  const router = useRouter();
  useEffect(() => reportError(error), [error]);
  return (
    <Stack>
      <Heading level={1}>Une erreur est survenue</Heading>
      <Text>Quelque chose s'est mal passé. Vous pouvez réessayer.</Text>
      <Button onClick={() => void router.invalidate()}>Réessayer</Button>
    </Stack>
  );
}

function NotFound() {
  return (
    <Stack>
      <Heading level={1}>404 : page introuvable</Heading>
      <Text>Cette page n'existe pas.</Text>
      <Link to="/" className={buttonVariants()}>
        Retour à l'accueil
      </Link>
    </Stack>
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  errorComponent: GlobalError,
  notFoundComponent: NotFound,
});
