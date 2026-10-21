import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { MAX_LINE_QUANTITY } from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';
import {
  Button,
  Card,
  CardContent,
  Heading,
  Stack,
  Text,
  buttonVariants,
} from '@nx-react-nestjs/web-ui';

import { formatMoney } from '../data/format-money';
import { useCartLines, type CartLineView } from '../hooks/use-cart-lines';
import { isProductUnavailable, usePlaceOrder } from '../hooks/use-place-order';
import { removeFromCart, setCartQuantity } from '../states/cart';

function QuantityStepper({ line }: { line: CartLineView }) {
  const { t } = useLingui();
  return (
    <Stack direction="row" gap={2} align="center">
      <Button
        variant="outline"
        size="icon"
        aria-label={t`Diminuer la quantité`}
        disabled={line.quantity <= 1}
        onClick={() => setCartQuantity(line.productId, line.quantity - 1)}
      >
        −
      </Button>
      <Text as="span" weight="semibold" aria-live="polite">
        {line.quantity}
      </Text>
      <Button
        variant="outline"
        size="icon"
        aria-label={t`Augmenter la quantité`}
        disabled={line.quantity >= MAX_LINE_QUANTITY}
        onClick={() => setCartQuantity(line.productId, line.quantity + 1)}
      >
        +
      </Button>
    </Stack>
  );
}

function CartLineRow({ line }: { line: CartLineView }) {
  const { i18n } = useLingui();
  const { product } = line;
  // Le prix en cache d'un produit indisponible n'a plus de sens.
  const price = line.unavailable ? undefined : product?.price;
  return (
    <li className="list-none">
      <Card className={line.unavailable ? 'opacity-60' : undefined}>
        <CardContent>
          <Stack direction="row" gap={4} align="center" justify="between" wrap>
            <Stack gap={1}>
              <Text weight="semibold">{product?.name ?? line.name}</Text>
              {price && (
                <Text size="sm" tone="muted">
                  {formatMoney(price, i18n.locale)}
                </Text>
              )}
              {line.unavailable && (
                <Text size="sm" tone="destructive" role="alert">
                  <Trans>Ce produit n&apos;est plus disponible</Trans>
                </Text>
              )}
              {line.failed && (
                <Text size="sm" tone="destructive" role="alert">
                  <Trans>Impossible de charger ce produit</Trans>
                </Text>
              )}
              {line.loading && (
                <Text size="sm" tone="muted" aria-live="polite">
                  <Trans>Chargement…</Trans>
                </Text>
              )}
            </Stack>
            <Stack direction="row" gap={4} align="center">
              {!line.unavailable && <QuantityStepper line={line} />}
              {price && (
                <Text weight="semibold">
                  {formatMoney(
                    { amountMinor: price.amountMinor * line.quantity, currency: price.currency },
                    i18n.locale,
                  )}
                </Text>
              )}
              <Button variant="ghost" onClick={() => removeFromCart(line.productId)}>
                <Trans>Retirer</Trans>
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </li>
  );
}

export function CartPage({ api }: { api: ApiClient }) {
  const { i18n } = useLingui();
  const { lines, total, mixedCurrencies, canOrder } = useCartLines(api);
  const placeOrder = usePlaceOrder(api);

  if (lines.length === 0) {
    return (
      <Stack as="section" className="p-4">
        <Heading level={1}>
          <Trans>Panier</Trans>
        </Heading>
        <Text tone="muted">
          <Trans>Votre panier est vide</Trans>
        </Text>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          <Trans>Voir le catalogue</Trans>
        </Link>
      </Stack>
    );
  }

  return (
    <Stack as="section" className="p-4">
      <Heading level={1}>
        <Trans>Panier</Trans>
      </Heading>
      <Stack as="ul">
        {lines.map((line) => (
          <CartLineRow key={line.productId} line={line} />
        ))}
      </Stack>
      {mixedCurrencies && (
        <Text role="alert" tone="destructive">
          <Trans>
            Votre panier mélange plusieurs devises : retirez des produits pour pouvoir commander.
          </Trans>
        </Text>
      )}
      {isProductUnavailable(placeOrder.error) && (
        <Text role="alert" tone="destructive">
          <Trans>Certains produits ne sont plus disponibles.</Trans>
        </Text>
      )}
      <Stack direction="row" gap={4} align="center" justify="between">
        <Text weight="semibold">
          {total ? <Trans>Total : {formatMoney(total, i18n.locale)}</Trans> : <Trans>Total</Trans>}
        </Text>
        <Button
          disabled={!canOrder || placeOrder.isPending}
          onClick={() =>
            placeOrder.mutate({
              lines: lines.map(({ productId, quantity }) => ({ productId, quantity })),
            })
          }
        >
          <Trans>Passer la commande</Trans>
        </Button>
      </Stack>
    </Stack>
  );
}
