import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@nx-react-nestjs/web-data-access';

import { renderWithProviders } from '../../test-utils';
import { OrderPage } from './order-page';

const API = 'http://localhost:3000/api/v1';
const api = createApiClient({ baseUrl: API });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());

const ORDER_ID = 'ORD-00000000000000000001';

function order(status: 'placed' | 'cancelled' = 'placed') {
  return {
    id: ORDER_ID,
    customerId: '6f9619ff-8b86-4011-b42d-00c04fc964ff',
    status,
    lines: [
      {
        productId: 'PRD-00000000000000000001',
        sku: 'TEE-BLACK-L',
        name: 'Tee-shirt noir (L)',
        unitPrice: { amountMinor: 2190, currency: 'EUR' },
        quantity: 2,
        subtotal: { amountMinor: 4380, currency: 'EUR' },
      },
      {
        productId: 'PRD-00000000000000000002',
        sku: 'CAP-RED',
        name: 'Casquette rouge',
        unitPrice: { amountMinor: 1140, currency: 'EUR' },
        quantity: 1,
        subtotal: { amountMinor: 1140, currency: 'EUR' },
      },
    ],
    total: { amountMinor: 5580, currency: 'EUR' },
    createdAt: '2026-03-04T10:30:00.000Z',
    updatedAt: '2026-03-04T10:30:00.000Z',
  };
}

function serveOrder(body: ReturnType<typeof order>) {
  server.use(http.get(`${API}/orders/${ORDER_ID}`, () => HttpResponse.json(body)));
}

/** Après l'annulation, le serveur renvoie la commande annulée (l'invalidation refait un GET). */
function serveCancel() {
  const calls = { count: 0 };
  server.use(
    http.get(`${API}/orders/${ORDER_ID}`, () =>
      HttpResponse.json(order(calls.count > 0 ? 'cancelled' : 'placed')),
    ),
    http.post(`${API}/orders/${ORDER_ID}/cancel`, () => {
      calls.count += 1;
      return HttpResponse.json(order('cancelled'));
    }),
  );
  return calls;
}

function normalized(text: string | null) {
  return (text ?? '').replace(/[\s  ]+/g, ' ');
}

describe('OrderPage', () => {
  it('shows the order summary with frozen prices', async () => {
    serveOrder(order());
    await renderWithProviders(<OrderPage api={api} orderId={ORDER_ID} canCancel />);
    expect(
      await screen.findByRole('heading', { level: 1, name: `Commande ${ORDER_ID}` }),
    ).toBeTruthy();
    expect(screen.getByText('Passée')).toBeTruthy();
    expect(screen.getByText('Tee-shirt noir (L)')).toBeTruthy();
    expect(
      screen.getByText(
        (_, el) => el?.children.length === 0 && normalized(el.textContent) === '2 × 21,90 €',
      ),
    ).toBeTruthy();
    expect(screen.getAllByText(/55,80/).length).toBeGreaterThan(0);
    const date = new Intl.DateTimeFormat('fr', { dateStyle: 'short', timeStyle: 'short' }).format(
      new Date('2026-03-04T10:30:00.000Z'),
    );
    expect(screen.getByText(date)).toBeTruthy();
  });

  it('cancels after confirmation', async () => {
    serveOrder(order());
    const calls = serveCancel();
    await renderWithProviders(<OrderPage api={api} orderId={ORDER_ID} canCancel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler la commande' }));
    const dialog = await screen.findByRole('dialog', { name: 'Annuler cette commande ?' });
    expect(within(dialog).getByText('Cette action est définitive.')).toBeTruthy();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Oui, annuler' }));
    expect(await screen.findByText('Annulée')).toBeTruthy();
    expect(calls.count).toBe(1);
    expect(screen.queryByRole('button', { name: 'Annuler la commande' })).toBeNull();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('keeps the order when the user backs out', async () => {
    serveOrder(order());
    const calls = serveCancel();
    await renderWithProviders(<OrderPage api={api} orderId={ORDER_ID} canCancel />);
    await userEvent.click(await screen.findByRole('button', { name: 'Annuler la commande' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Garder' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('Passée')).toBeTruthy();
    expect(calls.count).toBe(0);
  });

  it('hides cancel when the flag is off', async () => {
    serveOrder(order());
    await renderWithProviders(<OrderPage api={api} orderId={ORDER_ID} canCancel={false} />);
    expect(await screen.findByText('Passée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler la commande' })).toBeNull();
  });

  it('hides cancel when the order is already cancelled', async () => {
    serveOrder(order('cancelled'));
    await renderWithProviders(<OrderPage api={api} orderId={ORDER_ID} canCancel />);
    expect(await screen.findByText('Annulée')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Annuler la commande' })).toBeNull();
  });
});
