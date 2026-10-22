import { createFileRoute } from '@tanstack/react-router';
import { CatalogPage } from '@nx-react-nestjs/web-storefront';

import { ErrorZone } from '../../../components/error-zone';
import { requireFeature } from '../../../feature-flags';

function Catalog() {
  const { api } = Route.useRouteContext();
  return (
    <ErrorZone>
      <CatalogPage api={api} />
    </ErrorZone>
  );
}

export const Route = createFileRoute('/_authenticated/(boutique)/boutique')({
  beforeLoad: requireFeature('storefront'),
  component: Catalog,
});
