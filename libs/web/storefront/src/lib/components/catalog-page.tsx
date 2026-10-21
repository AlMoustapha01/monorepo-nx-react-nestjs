import { Trans, useLingui } from '@lingui/react/macro';
import { useInfiniteQuery } from '@tanstack/react-query';
import { MAX_ORDER_LINES, type ProductResponse } from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Heading,
  Stack,
  Text,
} from '@nx-react-nestjs/web-ui';

import { formatMoney } from '../data/format-money';
import { productsInfiniteQueryOptions } from '../data/products';
import { addToCart, canAddToCart, useCart } from '../states/cart';

function ProductCard({ product }: { product: ProductResponse }) {
  const { i18n } = useLingui();
  const lines = useCart();
  const inCart = lines.find((line) => line.productId === product.id)?.quantity ?? 0;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{product.name}</CardTitle>
        <CardDescription>{product.sku}</CardDescription>
      </CardHeader>
      <CardContent>
        <Text weight="semibold">{formatMoney(product.price, i18n.locale)}</Text>
      </CardContent>
      <CardFooter>
        <Stack direction="row" gap={3} align="center">
          <Button
            disabled={!canAddToCart(lines, product.id)}
            onClick={() => addToCart({ id: product.id, name: product.name })}
          >
            <Trans>Ajouter au panier</Trans>
          </Button>
          {inCart > 0 && (
            <Text as="span" size="sm" tone="muted">
              <Trans>✓ {inCart} dans le panier</Trans>
            </Text>
          )}
        </Stack>
      </CardFooter>
    </Card>
  );
}

export function CatalogPage({ api }: { api: ApiClient }) {
  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(productsInfiniteQueryOptions(api));
  const products = data?.pages.flatMap((page) => page.items) ?? [];
  const cartFull = useCart().length >= MAX_ORDER_LINES;

  return (
    <Stack as="section" className="p-4">
      <Heading level={1}>
        <Trans>Catalogue</Trans>
      </Heading>
      {isPending ? (
        <Text aria-live="polite">
          <Trans>Chargement…</Trans>
        </Text>
      ) : isError && products.length === 0 ? (
        <Text role="alert" tone="destructive">
          <Trans>Impossible de charger le catalogue.</Trans>
        </Text>
      ) : products.length === 0 ? (
        <Text tone="muted">
          <Trans>Aucun produit pour le moment</Trans>
        </Text>
      ) : (
        <>
          {cartFull && (
            <Text role="status" tone="muted">
              <Trans>Votre panier contient déjà {MAX_ORDER_LINES} produits différents.</Trans>
            </Text>
          )}
          <Stack as="ul" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {products.map((product) => (
              <li key={product.id} className="list-none">
                <ProductCard product={product} />
              </li>
            ))}
          </Stack>
        </>
      )}
      {hasNextPage && (
        <Button
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          <Trans>Voir plus</Trans>
        </Button>
      )}
    </Stack>
  );
}
