import { useSuspenseQuery } from '@tanstack/react-query';
import { notFound, useRouteContext } from '@tanstack/react-router';
import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import {
  featureFlagsQueryOptions,
  isFeatureEnabled,
  type ApiClient,
} from '@nx-react-nestjs/web-data-access';
import type { QueryClient } from '@tanstack/react-query';

import { reportError } from './report-error';

interface FlagsContext {
  queryClient: QueryClient;
  api: ApiClient;
}

/** `beforeLoad` de route : 404 quand le flag est coupé. */
export function requireFeature(flag: FeatureFlag) {
  return async ({ context }: { context: FlagsContext }): Promise<void> => {
    const data = await context.queryClient.ensureQueryData(
      featureFlagsQueryOptions(context.api, reportError),
    );
    if (!isFeatureEnabled(data, flag)) throw notFound();
  };
}

/** Lecture d'un flag dans un composant de l'app (les libs reçoivent des booléens en props). */
export function useFeatureFlag(flag: FeatureFlag): boolean {
  const { api } = useRouteContext({ from: '__root__' });
  const { data } = useSuspenseQuery(featureFlagsQueryOptions(api, reportError));
  return isFeatureEnabled(data, flag);
}
