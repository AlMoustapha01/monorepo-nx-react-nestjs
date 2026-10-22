import { randomUUID } from 'node:crypto';
import { type APIRequestContext, expect, request } from '@playwright/test';

import { E2E_PORTS } from './stack';
import type { Account } from './support';

async function ok<T>(what: string, response: Awaited<ReturnType<APIRequestContext['post']>>) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

/** Produit publié dans l'organisation active du compte (staff : propriétaire). */
export async function publishProduct(account: Account, name: string): Promise<void> {
  const { token } = await ok<{ token: string }>('token', await account.auth.get('token'));
  const api = await request.newContext({
    baseURL: `http://localhost:${E2E_PORTS.api}/api/v1/`,
    extraHTTPHeaders: { authorization: `Bearer ${token}` },
  });
  const product = await ok<{ id: string }>(
    'product',
    await api.post('catalog/products', {
      headers: { 'idempotency-key': randomUUID() },
      data: {
        sku: `SKU-${randomUUID().slice(0, 8)}`,
        name,
        price: { amountMinor: 1990, currency: 'EUR' },
      },
    }),
  );
  await ok('publish', await api.post(`catalog/products/${product.id}/publish`));
  await api.dispose();
}
