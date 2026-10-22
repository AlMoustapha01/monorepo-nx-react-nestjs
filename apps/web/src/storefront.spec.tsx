import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import {
  API,
  renderAt,
  renderSignedIn,
  serveTwoOrganizations,
  setupAppTest,
} from './testing/app-harness';

const server = setupAppTest();

/** Tenant inscrit dans le token factice d'une requête à l'API (voir `serveTwoOrganizations`). */
function tenantOf(request: Request): string | undefined {
  const payload = request.headers.get('authorization')?.split('.')[1];
  return payload ? (JSON.parse(atob(payload)) as { tenant?: string }).tenant : undefined;
}

const storefrontOn = () =>
  http.get(`${API}/feature-flags`, () => HttpResponse.json({ flags: { storefront: true } }));

const product = (id: string, name: string) => ({
  id,
  sku: `SKU-${id.slice(-3)}`,
  name,
  description: null,
  price: { amountMinor: 1990, currency: 'EUR' },
  status: 'active',
  soldCount: 0,
  version: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

describe('storefront', () => {
  it('shows the catalog and the storefront links when storefront is on', async () => {
    server.use(
      storefrontOn(),
      http.get(`${API}/catalog/products`, () =>
        HttpResponse.json({
          items: [product('PRD-00000000000000000001', 'Tee-shirt blanc (M)')],
          nextCursor: null,
        }),
      ),
    );
    renderAt('/boutique');
    expect(await screen.findByText('Tee-shirt blanc (M)')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Boutique' }).getAttribute('href')).toBe('/boutique');
    expect(screen.getByRole('link', { name: 'Panier (0)' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Mes commandes' })).toBeTruthy();
  });

  it('shows the 404 page for an unknown order', async () => {
    const id = 'ORD-00000000000000000001';
    server.use(
      storefrontOn(),
      http.get(`${API}/orders/${id}`, () =>
        HttpResponse.json(
          { status: 404, code: 'NOT_FOUND', title: 'Not Found', detail: 'Order not found' },
          { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    );
    renderAt(`/commandes/${id}`);
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
  });

  it('shows the 404 page for a malformed order ID without calling the API', async () => {
    let calls = 0;
    server.use(
      storefrontOn(),
      http.get(`${API}/orders/:id`, () => {
        calls += 1;
        return HttpResponse.json(
          { status: 400, code: 'VALIDATION_FAILED', title: 'Bad Request', detail: 'Invalid id' },
          { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
        );
      }),
    );
    renderAt('/commandes/abc');
    const heading = await screen.findByRole('heading', { level: 1 });
    expect(heading.textContent).toBe('404 : page introuvable');
    expect(calls).toBe(0);
  });

  it.each(['/boutique', '/panier'])(
    'shows the 404 page on %s when storefront is off',
    async (url) => {
      renderAt(url);
      const heading = await screen.findByRole('heading', { level: 1 });
      expect(heading.textContent).toBe('404 : page introuvable');
    },
  );

  it('recharge les données du nouveau tenant au changement d’organisation', async () => {
    // Comme la vraie API : le catalogue dépend du tenant inscrit dans le token.
    const catalogs: Record<string, ReturnType<typeof product>[]> = {
      o1: [product('PRD-00000000000000000001', 'Tablier en lin')],
      o2: [product('PRD-00000000000000000002', 'Mug émaillé')],
    };
    serveTwoOrganizations(server);
    server.use(
      storefrontOn(),
      http.get(`${API}/catalog/products`, ({ request }) =>
        HttpResponse.json({ items: catalogs[tenantOf(request) ?? ''] ?? [], nextCursor: null }),
      ),
    );
    renderSignedIn('/boutique');
    expect(await screen.findByText('Tablier en lin')).toBeTruthy();

    const events = userEvent.setup();
    await events.selectOptions(
      await screen.findByRole('combobox', { name: 'Organisation' }),
      'Comptoir',
    );
    // Le changement ramène à l'accueil ; le catalogue est celui du nouveau tenant.
    await screen.findByRole('heading', { level: 1, name: 'Accueil' });
    await events.click(screen.getByRole('link', { name: 'Boutique' }));
    expect(await screen.findByText('Mug émaillé')).toBeTruthy();
    expect(screen.queryByText('Tablier en lin')).toBeNull();
  });
});
