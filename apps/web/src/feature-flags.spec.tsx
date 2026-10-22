import { QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRouteWithContext,
  createRouter,
  isNotFound,
} from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import { createApiClient, createQueryClient } from '@nx-react-nestjs/web-data-access';

import { requireFeature, useFeatureFlag } from './feature-flags';
import type { RouterContext } from './routes/__root';

const API = 'http://localhost:3000/api/v1';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => {
  server.resetHandlers();
  vi.restoreAllMocks();
});
afterAll(() => server.close());

const api = createApiClient({ baseUrl: API });
// Nom quelconque : le mécanisme ne dépend pas du catalogue du projet (qui peut être vide).
const FLAG = 'demo' as unknown as FeatureFlag;
const flagsAre = (flags: Record<string, boolean>) =>
  server.use(http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags })));

describe('requireFeature', () => {
  const guard = () => requireFeature(FLAG)({ context: { queryClient: createQueryClient(), api } });

  it('resolves when the flag is on', async () => {
    flagsAre({ [FLAG]: true });
    await expect(guard()).resolves.toBeUndefined();
  });

  it('throws notFound when the flag is off', async () => {
    flagsAre({ [FLAG]: false });
    await expect(guard()).rejects.toSatisfy(isNotFound);
  });

  it('throws notFound when the flags call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    server.use(http.get(`${API}/feature-flags`, () => new HttpResponse(null, { status: 500 })));
    await expect(guard()).rejects.toSatisfy(isNotFound);
  });
});

describe('useFeatureFlag', () => {
  function Probe() {
    return <p>{useFeatureFlag(FLAG) ? 'on' : 'off'}</p>;
  }

  function renderProbe() {
    const queryClient = createQueryClient();
    const root = createRootRouteWithContext<RouterContext>()({ component: Probe });
    const router = createRouter({
      routeTree: root,
      context: { queryClient, api },
      history: createMemoryHistory({ initialEntries: ['/'] }),
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
  }

  it('returns true when the flag is on', async () => {
    flagsAre({ [FLAG]: true });
    renderProbe();
    expect(await screen.findByText('on')).toBeTruthy();
  });

  it('returns false when the flag is off', async () => {
    flagsAre({});
    renderProbe();
    expect(await screen.findByText('off')).toBeTruthy();
  });
});
