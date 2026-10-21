import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createApiClient } from '@nx-react-nestjs/web-data-access';

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

  it('shows the empty state with a link to the catalog', async () => {
    await renderWithProviders(<CartPage api={api} />, { routes: ['/'] });
    expect(await screen.findByText('Votre panier est vide')).toBeTruthy();
    const link = screen.getByRole('link', { name: 'Voir le catalogue' });
    expect(link.getAttribute('href')).toBe('/');
  });
});
