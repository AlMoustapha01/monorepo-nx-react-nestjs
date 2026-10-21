import { act, renderHook } from '@testing-library/react';
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES } from '@nx-react-nestjs/contracts';
import {
  CART_STORAGE_KEY,
  addToCart,
  canAddToCart,
  cartCount,
  clearCart,
  removeFromCart,
  setCartQuantity,
  useCart,
} from './cart';

const resetStore = () => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
};

const product = (n: number) => ({ id: `PRD-${n}`, name: `Product ${n}` });

beforeEach(() => {
  vi.restoreAllMocks();
  resetStore();
});

describe('cart', () => {
  it('adds a product then increments its quantity', () => {
    const { result } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    act(() => addToCart(product(1)));
    expect(result.current).toEqual([{ productId: 'PRD-1', name: 'Product 1', quantity: 2 }]);
    expect(cartCount(result.current)).toBe(2);
  });

  it('caps a line at MAX_LINE_QUANTITY', () => {
    const { result } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    act(() => setCartQuantity('PRD-1', MAX_LINE_QUANTITY));
    expect(canAddToCart(result.current, 'PRD-1')).toBe(false);
    act(() => addToCart(product(1)));
    expect(result.current[0]?.quantity).toBe(MAX_LINE_QUANTITY);
  });

  it('refuses a new product once MAX_ORDER_LINES lines exist', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      for (let n = 1; n <= MAX_ORDER_LINES; n += 1) addToCart(product(n));
    });
    expect(result.current).toHaveLength(MAX_ORDER_LINES);
    expect(canAddToCart(result.current, 'PRD-new')).toBe(false);
    expect(canAddToCart(result.current, 'PRD-1')).toBe(true);
    act(() => addToCart({ id: 'PRD-new', name: 'New' }));
    expect(result.current).toHaveLength(MAX_ORDER_LINES);
  });

  it('persists across reloads', () => {
    const { result } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    expect(JSON.parse(localStorage.getItem('app.cart') ?? 'null')).toEqual({
      version: 1,
      lines: [{ productId: 'PRD-1', name: 'Product 1', quantity: 1 }],
    });
    const second = renderHook(() => useCart());
    expect(second.result.current).toEqual(result.current);
  });

  it('starts empty when stored content is corrupted', () => {
    localStorage.setItem(CART_STORAGE_KEY, '{oops');
    window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
    const { result } = renderHook(() => useCart());
    expect(result.current).toEqual([]);
  });

  it('starts empty when stored version is unknown', () => {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 2, lines: [] }));
    window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
    const { result } = renderHook(() => useCart());
    expect(result.current).toEqual([]);
  });

  it('keeps a stable snapshot while content is unchanged', () => {
    const { result, rerender } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    const before = result.current;
    rerender();
    expect(result.current).toBe(before);
  });

  it('keeps working in memory when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    const { result } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    expect(result.current).toHaveLength(1);
  });

  it('follows changes made in another tab', () => {
    const { result } = renderHook(() => useCart());
    const lines = [{ productId: 'PRD-9', name: 'Other', quantity: 3 }];
    act(() => {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ version: 1, lines }));
      window.dispatchEvent(new StorageEvent('storage', { key: CART_STORAGE_KEY }));
    });
    expect(result.current).toEqual(lines);
  });

  it('clearCart empties the cart', () => {
    const { result } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    act(() => clearCart());
    expect(result.current).toEqual([]);
  });

  it('removeFromCart removes one line', () => {
    const { result } = renderHook(() => useCart());
    act(() => {
      addToCart(product(1));
      addToCart(product(2));
    });
    act(() => removeFromCart('PRD-1'));
    expect(result.current.map((line) => line.productId)).toEqual(['PRD-2']);
  });

  it('setCartQuantity clamps to 1..99', () => {
    const { result } = renderHook(() => useCart());
    act(() => addToCart(product(1)));
    act(() => setCartQuantity('PRD-1', 500));
    expect(result.current[0]?.quantity).toBe(MAX_LINE_QUANTITY);
    act(() => setCartQuantity('PRD-1', 0));
    expect(result.current[0]?.quantity).toBe(1);
  });
});
