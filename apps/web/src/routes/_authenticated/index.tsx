import { Trans } from '@lingui/react/macro';
import { createFileRoute } from '@tanstack/react-router';
import { CatalogPage } from '@nx-react-nestjs/web-storefront';
import { Heading } from '@nx-react-nestjs/web-ui';

import { ErrorZone } from '../../components/error-zone';
import { useFeatureFlag } from '../../feature-flags';

function Home() {
  const { api } = Route.useRouteContext();
  const storefront = useFeatureFlag('storefront');
  if (storefront) {
    return (
      <ErrorZone>
        <CatalogPage api={api} />
      </ErrorZone>
    );
  }
  return (
    <Heading level={1}>
      <Trans>Boilerplate web</Trans>
    </Heading>
  );
}

export const Route = createFileRoute('/_authenticated/')({ component: Home });
