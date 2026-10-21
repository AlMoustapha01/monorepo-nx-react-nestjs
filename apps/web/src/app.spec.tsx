import { QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { createApiClient, createQueryClient } from '@nx-react-nestjs/web-data-access';

import { ErrorZone } from './components/error-zone';
import { createAppRouter } from './router';
import { Route as rootRoute } from './routes/__root';

const api = createApiClient({ baseUrl: 'http://localhost:3000/api/v1' });

function renderAt(url: string) {
  const queryClient = createQueryClient();
  const router = createAppRouter(queryClient, api, createMemoryHistory({ initialEntries: [url] }));
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('app', () => {
  it('renders the home page at /', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { level: 1 })).toBeTruthy();
  });

  it('renders the 404 page inside the layout for an unknown URL', async () => {
    renderAt('/nope');
    const heading = await screen.findByRole('heading', { name: /404/ });
    expect(heading).toBeTruthy();
    expect(screen.getByRole('link', { name: /accueil/i }).getAttribute('href')).toBe('/');
    expect(screen.queryByText(/erreur/i)).toBeNull();
  });

  it('renders the global error page when a route throws', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const queryClient = createQueryClient();
    const boom = createRoute({
      getParentRoute: () => rootRoute,
      path: '/boom',
      component: () => {
        throw new Error('boom');
      },
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([boom]),
      context: { queryClient, api },
      history: createMemoryHistory({ initialEntries: ['/boom'] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('button', { name: /réessayer/i })).toBeTruthy();
    vi.restoreAllMocks();
  });
});

describe('ErrorZone', () => {
  it('shows its fallback and calls reportError', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    function Bad(): never {
      throw new Error('zone');
    }
    render(
      <ErrorZone fallback={<p>secours</p>}>
        <Bad />
      </ErrorZone>,
    );
    expect(screen.getByText('secours')).toBeTruthy();
    expect(spy.mock.calls.some((c) => c[0] === '[reportError]')).toBe(true);
    spy.mockRestore();
  });
});
