import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@nx-react-nestjs/web-data-access';

import { PENDING_ORDER_STORAGE_KEY } from '../hooks/use-place-order';
import { CART_STORAGE_KEY } from '../states/cart';
import { renderWithProviders } from '../../test-utils';
import { CartPage } from './cart-page';

const API = 'http://localhost:3000/api/v1';
const api = createApiClient({ baseUrl: API });
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterAll(() => server.close());
afterEach(() => server.resetHandlers());
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
});

const ID_A = 'PRD-00000000000000000001';
const ID_B = 'PRD-00000000000000000002';

function product(id: string, name: string, amountMinor: number, currency = 'EUR') {
  return {
    id,
    sku: 'SKU-100',
    name,
    description: null,
    price: { amountMinor, currency },
    status: 'active',
    soldCount: 0,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

function seedCart(lines: Array<{ productId: string; name: string; quantity: number }>) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, lines }));
  window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
}

function serveProduct(id: string, body: ReturnType<typeof product> | null) {
  server.use(
    http.get(`${API}/catalog/products/${id}`, () =>
      body ? HttpResponse.json(body) : HttpResponse.json({}, { status: 404 }),
    ),
  );
}

function storedQuantity(): number {
  return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{}').lines[0].quantity;
}

function orderButton() {
  return screen.getByRole('button', { name: 'Passer la commande' }) as HTMLButtonElement;
}

describe('CartPage', () => {
  it('shows current catalog prices, not stored ones', async () => {
    seedCart([{ productId: ID_A, name: 'Ancien nom', quantity: 2 }]);
    serveProduct(ID_A, product(ID_A, 'Tee-shirt noir (L)', 2190));
    await renderWithProviders(<CartPage api={api} />);
    expect(await screen.findByText('Tee-shirt noir (L)')).toBeTruthy();
    expect(screen.queryByText('Ancien nom')).toBeNull();
    expect(screen.getAllByText(/43,80/).length).toBe(2);
  });

  it('greys out an unavailable product and blocks the order', async () => {
    seedCart([{ productId: ID_A, name: 'Sweat gris', quantity: 1 }]);
    serveProduct(ID_A, null);
    await renderWithProviders(<CartPage api={api} />);
    expect(await screen.findByText("Ce produit n'est plus disponible")).toBeTruthy();
    expect(screen.getByText('Sweat gris')).toBeTruthy();
    expect(orderButton().disabled).toBe(true);
    await userEvent.click(screen.getByRole('button', { name: 'Retirer' }));
    expect(await screen.findByText('Votre panier est vide')).toBeTruthy();
  });

  it('enables the order once the unavailable line is removed', async () => {
    seedCart([
      { productId: ID_A, name: 'Sweat gris', quantity: 1 },
      { productId: ID_B, name: 'Casquette', quantity: 1 },
    ]);
    serveProduct(ID_A, null);
    serveProduct(ID_B, product(ID_B, 'Casquette', 1500));
    await renderWithProviders(<CartPage api={api} />);
    await screen.findByText("Ce produit n'est plus disponible");
    await screen.findByText('Casquette');
    expect(orderButton().disabled).toBe(true);
    const row = screen.getByText('Sweat gris').closest('li') as HTMLElement;
    await userEvent.click(within(row).getByRole('button', { name: 'Retirer' }));
    expect(screen.queryByText('Sweat gris')).toBeNull();
    expect(orderButton().disabled).toBe(false);
  });

  it('keeps the order disabled when a product fails to load for another reason', async () => {
    seedCart([{ productId: ID_A, name: 'Sweat gris', quantity: 1 }]);
    server.use(
      http.get(`${API}/catalog/products/${ID_A}`, () => HttpResponse.json({}, { status: 403 })),
    );
    await renderWithProviders(<CartPage api={api} />);
    expect(await screen.findByText('Impossible de charger ce produit')).toBeTruthy();
    expect(screen.queryByText("Ce produit n'est plus disponible")).toBeNull();
    expect(orderButton().disabled).toBe(true);
  });

  it('changes quantity with the stepper', async () => {
    seedCart([{ productId: ID_A, name: 'Casquette', quantity: 2 }]);
    serveProduct(ID_A, product(ID_A, 'Casquette', 1500));
    await renderWithProviders(<CartPage api={api} />);
    await screen.findByText('Casquette');
    await userEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
    expect(storedQuantity()).toBe(3);
    await userEvent.click(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    await userEvent.click(screen.getByRole('button', { name: 'Diminuer la quantité' }));
    expect(storedQuantity()).toBe(1);
    expect(
      (screen.getByRole('button', { name: 'Diminuer la quantité' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('blocks mixed currencies', async () => {
    seedCart([
      { productId: ID_A, name: 'Casquette', quantity: 1 },
      { productId: ID_B, name: 'Boubou', quantity: 1 },
    ]);
    serveProduct(ID_A, product(ID_A, 'Casquette', 1500, 'EUR'));
    serveProduct(ID_B, product(ID_B, 'Boubou', 25000, 'XOF'));
    await renderWithProviders(<CartPage api={api} />);
    expect(
      await screen.findByText(
        'Votre panier mélange plusieurs devises : retirez des produits pour pouvoir commander.',
      ),
    ).toBeTruthy();
    expect(orderButton().disabled).toBe(true);
  });

  it('leaves a product that became unavailable out of the total and the currency check', async () => {
    seedCart([
      { productId: ID_A, name: 'Boubou', quantity: 1 },
      { productId: ID_B, name: 'Casquette', quantity: 2 },
    ]);
    serveProduct(ID_A, product(ID_A, 'Boubou', 25000, 'XOF'));
    serveProduct(ID_B, product(ID_B, 'Casquette', 1500, 'EUR'));
    const { queryClient } = await renderWithProviders(<CartPage api={api} />);
    await screen.findByText(
      'Votre panier mélange plusieurs devises : retirez des produits pour pouvoir commander.',
    );
    expect(screen.getAllByText(/25\s000/).length).toBe(2);

    // Le produit disparaît du catalogue ; ses données restent en cache.
    serveProduct(ID_A, null);
    await queryClient.invalidateQueries();
    await screen.findByText("Ce produit n'est plus disponible");
    expect(screen.queryByText(/plusieurs devises/)).toBeNull();
    expect(screen.queryByText(/25\s000/)).toBeNull();
    expect(screen.getByText(/Total : 30,00/)).toBeTruthy();
  });

  it('shows the empty state with a link to the catalog', async () => {
    await renderWithProviders(<CartPage api={api} />, { routes: ['/'] });
    expect(await screen.findByText('Votre panier est vide')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Voir le catalogue' });
    expect(link.getAttribute('href')).toBe('/');
  });

  describe('placing the order', () => {
    const ORDER_ID = 'ORD-00000000000000000001';
    const order = {
      id: ORDER_ID,
      customerId: '3f2c9c0e-6d0e-4b8e-9d57-0d6a1c1d7a11',
      status: 'placed',
      lines: [],
      total: { amountMinor: 3000, currency: 'EUR' },
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    it('places the order, empties the cart and opens the summary', async () => {
      seedCart([{ productId: ID_A, name: 'Casquette', quantity: 2 }]);
      serveProduct(ID_A, product(ID_A, 'Casquette', 1500));
      let body: unknown;
      let key: string | null = null;
      server.use(
        http.post(`${API}/orders`, async ({ request }) => {
          body = await request.json();
          key = request.headers.get('idempotency-key');
          return HttpResponse.json(order, { status: 201 });
        }),
      );
      const { router } = await renderWithProviders(<CartPage api={api} />, {
        routes: ['/commandes/$orderId'],
      });
      await screen.findByText('Casquette');
      await userEvent.click(orderButton());
      expect(await screen.findByText('/commandes/$orderId')).toBeTruthy();
      expect(router.state.location.pathname).toBe(`/commandes/${ORDER_ID}`);
      expect(body).toEqual({ lines: [{ productId: ID_A, quantity: 2 }] });
      expect(key).toBeTruthy();
      expect(JSON.parse(localStorage.getItem(CART_STORAGE_KEY) ?? '{"lines":[]}').lines).toEqual(
        [],
      );
    });

    it('reuses the idempotency key when the order is retried after a failure', async () => {
      seedCart([{ productId: ID_A, name: 'Casquette', quantity: 1 }]);
      serveProduct(ID_A, product(ID_A, 'Casquette', 1500));
      const keys: Array<string | null> = [];
      server.use(
        http.post(`${API}/orders`, ({ request }) => {
          keys.push(request.headers.get('idempotency-key'));
          return HttpResponse.json({}, { status: 503 });
        }),
      );
      await renderWithProviders(<CartPage api={api} />, { routes: ['/commandes/$orderId'] });
      await screen.findByText('Casquette');
      await userEvent.click(orderButton());
      // Une tentative et deux retries automatiques, tous en échec.
      await waitFor(() => expect(orderButton().disabled).toBe(false), { timeout: 5000 });
      expect(keys).toHaveLength(3);
      expect(sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toContain(keys[0]);
      server.use(
        http.post(`${API}/orders`, ({ request }) => {
          keys.push(request.headers.get('idempotency-key'));
          return HttpResponse.json(order, { status: 201 });
        }),
      );
      await userEvent.click(orderButton());
      expect(await screen.findByText('/commandes/$orderId')).toBeTruthy();
      expect(keys).toHaveLength(4);
      expect(new Set(keys).size).toBe(1);
      expect(sessionStorage.getItem(PENDING_ORDER_STORAGE_KEY)).toBeNull();
    }, 10_000);

    it('uses a new idempotency key once the cart has changed', async () => {
      seedCart([{ productId: ID_A, name: 'Casquette', quantity: 1 }]);
      serveProduct(ID_A, product(ID_A, 'Casquette', 1500));
      const keys: Array<string | null> = [];
      server.use(
        http.post(`${API}/orders`, ({ request }) => {
          keys.push(request.headers.get('idempotency-key'));
          return HttpResponse.json({}, { status: 409 });
        }),
      );
      await renderWithProviders(<CartPage api={api} />);
      await screen.findByText('Casquette');
      await userEvent.click(orderButton());
      await waitFor(() => expect(keys).toHaveLength(1));
      await waitFor(() => expect(orderButton().disabled).toBe(false));
      await userEvent.click(screen.getByRole('button', { name: 'Augmenter la quantité' }));
      await userEvent.click(orderButton());
      await waitFor(() => expect(keys).toHaveLength(2));
      expect(keys[1]).toBeTruthy();
      expect(keys[1]).not.toBe(keys[0]);
    });

    it('sends a single order on double click', async () => {
      seedCart([{ productId: ID_A, name: 'Casquette', quantity: 1 }]);
      serveProduct(ID_A, product(ID_A, 'Casquette', 1500));
      let calls = 0;
      server.use(
        http.post(`${API}/orders`, async () => {
          calls += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          return HttpResponse.json(order, { status: 201 });
        }),
      );
      await renderWithProviders(<CartPage api={api} />, { routes: ['/commandes/$orderId'] });
      await screen.findByText('Casquette');
      await userEvent.dblClick(orderButton());
      await screen.findByText('/commandes/$orderId');
      expect(calls).toBe(1);
    });

    it('marks products unavailable when the API refuses them', async () => {
      seedCart([
        { productId: ID_A, name: 'Casquette', quantity: 1 },
        { productId: ID_B, name: 'Boubou', quantity: 1 },
      ]);
      serveProduct(ID_A, product(ID_A, 'Casquette', 1500));
      serveProduct(ID_B, product(ID_B, 'Boubou', 2500));
      server.use(
        http.post(`${API}/orders`, () => {
          serveProduct(ID_A, null);
          return HttpResponse.json(
            {
              type: 'about:blank',
              title: 'Unprocessable',
              status: 422,
              code: 'PRODUCT_UNAVAILABLE',
              detail: 'Some products are unavailable.',
              details: { productIds: [ID_A] },
            },
            { status: 422 },
          );
        }),
      );
      await renderWithProviders(<CartPage api={api} />);
      await screen.findByText('Casquette');
      await screen.findByText('Boubou');
      await userEvent.click(orderButton());
      expect(await screen.findByText('Certains produits ne sont plus disponibles.')).toBeTruthy();
      expect((await screen.findAllByText("Ce produit n'est plus disponible")).length).toBe(1);
      expect(orderButton().disabled).toBe(true);
    });
  });
});
