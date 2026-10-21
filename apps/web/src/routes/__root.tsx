import { useEffect } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { Trans } from '@lingui/react/macro';
import { Link, Outlet, createRootRouteWithContext, useRouter } from '@tanstack/react-router';
import { Toaster } from 'sonner';
import { featureFlagsQueryOptions, type ApiClient } from '@nx-react-nestjs/web-data-access';
import { StorefrontNav } from '@nx-react-nestjs/web-storefront';
import { Button, Heading, Stack, Text, buttonVariants } from '@nx-react-nestjs/web-ui';

import { LocaleSwitcher } from '../components/locale-switcher';
import { useFeatureFlag } from '../feature-flags';
import { reportError } from '../report-error';

export interface RouterContext {
  queryClient: QueryClient;
  api: ApiClient;
}

function RootLayout() {
  const storefront = useFeatureFlag('storefront');
  return (
    <>
      <header className="flex items-center justify-between p-4">
        {storefront ? <StorefrontNav /> : <span />}
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
  // Les flags sont chargés une fois, avant le premier rendu.
  beforeLoad: async ({ context }) => {
    await context.queryClient.ensureQueryData(featureFlagsQueryOptions(context.api, reportError));
  },
  component: RootLayout,
  errorComponent: GlobalError,
  notFoundComponent: NotFound,
});
