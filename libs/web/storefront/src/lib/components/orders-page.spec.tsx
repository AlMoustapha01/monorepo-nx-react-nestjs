import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@nx-react-nestjs/web-data-access';

import { renderWithProviders } from '../../test-utils';
import { OrdersPage } from './orders-page';

const API = 'http://localhost:3000/api/v1';
const api = createApiClient({ baseUrl: API });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

function order(n: number, status: 'placed' | 'cancelled' = 'placed', amountMinor = 5580) {
  return {
    id: `ORD-${String(n).padStart(20, '0')}`,
    customerId: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
    status,
    lines: [
      {
        productId: 'PRD-00000000000000000001',
        sku: 'TEE-BLACK-L',
        name: 'Tee-shirt noir (L)',
        unitPrice: { amountMinor, currency: 'EUR' },
        quantity: 1,
        subtotal: { amountMinor, currency: 'EUR' },
      },
    ],
    total: { amountMinor, currency: 'EUR' },
    createdAt: '2026-03-04T10:30:00.000Z',
    updatedAt: '2026-03-04T10:30:00.000Z',
  };
}

describe('OrdersPage', () => {
  it('lists orders with id, date, status and total, each linking to its summary', async () => {
    server.use(
      http.get(`${API}/orders`, () =>
        HttpResponse.json({ items: [order(1), order(2, 'cancelled', 1990)], nextCursor: null }),
      ),
    );
    await renderWithProviders(<OrdersPage api={api} />);
    const link = await screen.findByRole('link', { name: /ORD-00000000000000000001/ });
    expect(link.getAttribute('href')).toBe('/commandes/ORD-00000000000000000001');
    expect(link.textContent).toContain('Passée');
    expect(link.textContent).toMatch(/55,80/);
    expect(link.textContent).toMatch(/2026|26/);
    const second = screen.getByRole('link', { name: /ORD-00000000000000000002/ });
    expect(second.textContent).toContain('Annulée');
    expect(second.textContent).toMatch(/19,90/);
  });

  it('loads more with Voir plus', async () => {
    server.use(
      http.get(`${API}/orders`, ({ request }) => {
        const cursor = new URL(request.url).searchParams.get('cursor');
        return cursor === 'c1'
          ? HttpResponse.json({ items: [order(2)], nextCursor: null })
          : HttpResponse.json({ items: [order(1)], nextCursor: 'c1' });
      }),
    );
    await renderWithProviders(<OrdersPage api={api} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Voir plus' }));
    expect(await screen.findByRole('link', { name: /ORD-00000000000000000002/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /ORD-00000000000000000001/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Voir plus' })).toBeNull();
  });

  it('shows the empty state', async () => {
    server.use(http.get(`${API}/orders`, () => HttpResponse.json({ items: [], nextCursor: null })));
    await renderWithProviders(<OrdersPage api={api} />);
    expect(await screen.findByText("Vous n'avez pas encore de commande")).toBeTruthy();
  });
});
