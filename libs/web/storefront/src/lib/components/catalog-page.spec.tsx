import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@nx-react-nestjs/web-data-access';

import { CART_STORAGE_KEY } from '../states/cart';
import { renderWithProviders } from '../../test-utils';
import { CatalogPage } from './catalog-page';

const API = 'http://localhost:3000/api/v1';
const api = createApiClient({ baseUrl: API });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
});

function product(n: number, name = `Produit ${n}`) {
  return {
    id: `PRD-${String(n).padStart(20, '0')}`,
    sku: `SKU-${n}00`,
    name,
    description: null,
    price: { amountMinor: 1990, currency: 'EUR' },
    status: 'active',
    soldCount: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('CatalogPage', () => {
  it('lists products with name, sku and price', async () => {
    server.use(
      http.get(`${API}/catalog/products`, () =>
        HttpResponse.json({
          items: [{ ...product(1, 'Tee-shirt blanc (M)'), sku: 'TEE-WHITE-M' }, product(2)],
          nextCursor: null,
        }),
      ),
    );
    await renderWithProviders(<CatalogPage api={api} />);
    expect(await screen.findByText('Tee-shirt blanc (M)')).toBeTruthy();
    expect(screen.getByText('TEE-WHITE-M')).toBeTruthy();
    expect(screen.getAllByText(/19,90/).length).toBe(2);
  });

  it('loads the next page with Voir plus', async () => {
    server.use(
      http.get(`${API}/catalog/products`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === 'c1'
          ? HttpResponse.json({ items: [product(2)], nextCursor: null })
          : HttpResponse.json({ items: [product(1)], nextCursor: 'c1' });
      }),
    );
    await renderWithProviders(<CatalogPage api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));
    expect(await screen.findByText('Produit 2')).toBeTruthy();
    expect(screen.getByText('Produit 1')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('adds to cart and shows the count on the card', async () => {
    server.use(
      http.get(`${API}/catalog/products`, () =>
        HttpResponse.json({ items: [product(1, 'Casquette')], nextCursor: null }),
      ),
    );
    await renderWithProviders(<CatalogPage api={api} />);
    const add = await screen.findByRole('button', { name: 'Ajouter au panier' });
    await userEvent.click(add);
    await userEvent.click(add);
    expect(await screen.findByText('✓ 2 dans le panier')).toBeTruthy();
    expect(localStorage.getItem(CART_STORAGE_KEY)).toContain('Casquette');
  });

  it('shows the empty state', async () => {
    server.use(
      http.get(`${API}/catalog/products`, () => HttpResponse.json({ items: [], nextCursor: null })),
    );
    await renderWithProviders(<CatalogPage api={api} />);
    expect(await screen.findByText('Aucun produit pour le moment')).toBeTruthy();
  });
});
