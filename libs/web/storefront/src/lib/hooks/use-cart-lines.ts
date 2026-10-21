import { useQueries } from '@tanstack/react-query';
import type { Money, ProductResponse } from '@nx-react-nestjs/contracts';
import { ApiError, type ApiClient } from '@nx-react-nestjs/web-data-access';

import { productQueryOptions } from '../data/products';
import { useCart, type CartLine } from '../states/cart';

export type CartLineView = CartLine & {
  product?: ProductResponse;
  /** Le catalogue répond 404 : le produit n'existe plus ou n'est plus visible. */
  unavailable: boolean;
  /** Le produit n'a pas pu être chargé pour une autre raison (réseau, 5xx…). */
  failed: boolean;
  loading: boolean;
};

export interface CartLines {
  lines: CartLineView[];
  /** Défini quand toutes les lignes disponibles partagent une devise et qu'il y en a au moins une. */
  total?: Money;
  mixedCurrencies: boolean;
  canOrder: boolean;
}

/** Lignes du panier enrichies des produits courants du catalogue (nom et prix stockés ignorés). */
export function useCartLines(api: ApiClient): CartLines {
  const cart = useCart();
  const queries = useQueries({
    queries: cart.map((line) => productQueryOptions(api, line.productId)),
  });

  const lines = cart.map((line, index): CartLineView => {
    const query = queries[index];
    // Un 404 prime sur une donnée en cache : le produit a disparu depuis son dernier chargement.
    const unavailable = query?.error instanceof ApiError && query.error.status === 404;
    return {
      ...line,
      ...(query?.data ? { product: query.data } : {}),
      unavailable,
      failed: Boolean(query?.isError) && !unavailable && !query?.data,
      loading: query?.isPending ?? true,
    };
  });

  // Une ligne indisponible garde son produit en cache mais ne sera pas commandée.
  const priced = lines.filter((line) => line.product && !line.unavailable);
  const currencies = new Set(priced.map((line) => line.product?.price.currency));
  const mixedCurrencies = currencies.size > 1;
  const currency = [...currencies][0];
  const total: Money | undefined =
    !mixedCurrencies && currency
      ? {
          currency,
          amountMinor: priced.reduce(
            (sum, line) => sum + (line.product?.price.amountMinor ?? 0) * line.quantity,
            0,
          ),
        }
      : undefined;

  const canOrder =
    lines.length > 0 &&
    !mixedCurrencies &&
    lines.every((line) => line.product && !line.unavailable && !line.failed && !line.loading);

  return { lines, ...(total ? { total } : {}), mixedCurrencies, canOrder };
}
