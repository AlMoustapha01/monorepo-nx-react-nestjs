import type { QueryClient } from '@tanstack/react-query';
import { createRouter, type RouterHistory } from '@tanstack/react-router';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';

import { routeTree } from './routeTree.gen';

export function createAppRouter(queryClient: QueryClient, api: ApiClient, history?: RouterHistory) {
  return createRouter({
    routeTree,
    context: { queryClient, api },
    defaultPreload: 'intent',
    history,
  });
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
