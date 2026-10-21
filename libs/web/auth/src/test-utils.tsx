import type { ReactNode } from 'react';
import { setupI18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import { createQueryClient } from '@nx-react-nestjs/web-data-access';

export interface RenderOptions {
  /** Chemin où `ui` est rendu (défaut `/`). */
  path?: string;
  /** Routes factices, qui affichent leur chemin : permettent de vérifier une navigation. */
  routes?: string[];
}

/** Rend `ui` dans i18n (fr, catalogue vide : les messages source s'affichent), React Query et un routeur mémoire. */
export async function renderWithProviders(ui: ReactNode, options: RenderOptions = {}) {
  const { path = '/', routes = [] } = options;
  const i18n = setupI18n();
  i18n.loadAndActivate({ locale: 'fr', messages: {} });
  const queryClient = createQueryClient();

  const root = createRootRoute({ component: Outlet });
  const page = createRoute({ getParentRoute: () => root, path, component: () => ui });
  const stubs = routes
    .filter((route) => route !== path)
    .map((route) =>
      createRoute({ getParentRoute: () => root, path: route, component: () => <p>{route}</p> }),
    );
  const router = createRouter({
    routeTree: root.addChildren([page, ...stubs]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  await router.load();

  const result = render(
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>,
  );
  return { ...result, queryClient, router };
}
