export const storefrontKeys = {
  products: () => ['catalog', 'products'] as const,
  product: (id: string) => ['catalog', 'products', id] as const,
  orders: () => ['orders'] as const,
  order: (id: string) => ['orders', id] as const,
};
