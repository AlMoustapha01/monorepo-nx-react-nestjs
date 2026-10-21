import { useSyncExternalStore } from 'react';
import { z } from 'zod';
import { MAX_LINE_QUANTITY, MAX_ORDER_LINES } from '@nx-react-nestjs/contracts';

export const CART_STORAGE_KEY = 'app.cart';

const cartLineSchema = z.object({
  productId: z.string().min(1),
  name: z.string(),
  quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
});
const storedCartSchema = z.object({
  version: z.literal(1),
  lines: z.array(cartLineSchema).max(MAX_ORDER_LINES),
});

export type CartLine = z.infer<typeof cartLineSchema>;

const EMPTY: readonly CartLine[] = [];

/** Contenu brut gardé en mémoire quand localStorage est inutilisable ; `undefined` = pas de repli. */
let memoryRaw: string | null | undefined;
let cache: { raw: string | null; lines: readonly CartLine[] } = { raw: null, lines: EMPTY };
const listeners = new Set<() => void>();

function readRaw(): string | null {
  if (memoryRaw !== undefined) return memoryRaw;
  try {
    return localStorage.getItem(CART_STORAGE_KEY);
  } catch {
    return null;
  }
}

function parse(raw: string | null): readonly CartLine[] {
  if (raw === null) return EMPTY;
  try {
    const result = storedCartSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data.lines : EMPTY;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): readonly CartLine[] {
  const raw = readRaw();
  if (raw !== cache.raw) cache = { raw, lines: parse(raw) };
  return cache.lines;
}

function getServerSnapshot(): readonly CartLine[] {
  return EMPTY;
}

function notify(): void {
  for (const listener of listeners) listener();
}

function write(lines: readonly CartLine[]): void {
  const raw = JSON.stringify({ version: 1, lines });
  try {
    localStorage.setItem(CART_STORAGE_KEY, raw);
    memoryRaw = undefined;
  } catch {
    memoryRaw = raw;
  }
  notify();
}

function onStorage(event: StorageEvent): void {
  if (event.key !== CART_STORAGE_KEY && event.key !== null) return;
  memoryRaw = undefined;
  notify();
}

/** L'écoute des autres onglets commence au premier abonné et s'arrête au dernier (pas d'effet à l'import). */
function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) window.addEventListener('storage', onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

export function useCart(): readonly CartLine[] {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function cartCount(lines: readonly CartLine[]): number {
  return lines.reduce((total, line) => total + line.quantity, 0);
}

export function canAddToCart(lines: readonly CartLine[], productId: string): boolean {
  const line = lines.find((candidate) => candidate.productId === productId);
  if (line) return line.quantity < MAX_LINE_QUANTITY;
  return lines.length < MAX_ORDER_LINES;
}

export function addToCart(product: { id: string; name: string }): void {
  const lines = getSnapshot();
  if (!canAddToCart(lines, product.id)) return;
  const exists = lines.some((line) => line.productId === product.id);
  write(
    exists
      ? lines.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        )
      : [...lines, { productId: product.id, name: product.name, quantity: 1 }],
  );
}

export function setCartQuantity(productId: string, quantity: number): void {
  // NaN serait stocké `null` et rendrait tout le panier invalide à la lecture suivante.
  if (!Number.isFinite(quantity)) return;
  const clamped = Math.min(MAX_LINE_QUANTITY, Math.max(1, Math.trunc(quantity)));
  const lines = getSnapshot();
  if (!lines.some((line) => line.productId === productId)) return;
  write(
    lines.map((line) => (line.productId === productId ? { ...line, quantity: clamped } : line)),
  );
}

export function removeFromCart(productId: string): void {
  write(getSnapshot().filter((line) => line.productId !== productId));
}

export function clearCart(): void {
  write(EMPTY);
}
