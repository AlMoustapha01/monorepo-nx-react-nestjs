import { Trans, useLingui } from '@lingui/react/macro';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { OrderResponse } from '@nx-react-nestjs/contracts';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';
import { Button, Card, CardContent, Heading, Stack, Text } from '@nx-react-nestjs/web-ui';

import { formatDateTime } from '../data/format-date';
import { formatMoney } from '../data/format-money';
import { ordersInfiniteQueryOptions } from '../data/orders';
import { OrderStatusBadge } from './order-status-badge';

function OrderRow({ order }: { order: OrderResponse }) {
  const { i18n } = useLingui();
  return (
    <Link to="/commandes/$orderId" params={{ orderId: order.id }} className="block">
      <Card>
        <CardContent>
          <Stack direction="row" gap={4} align="center" justify="between" wrap>
            <Stack gap={1}>
              <Text weight="semibold">{order.id}</Text>
              <Text as="span" size="sm" tone="muted">
                {formatDateTime(order.createdAt, i18n.locale)}
              </Text>
            </Stack>
            <Stack direction="row" gap={4} align="center">
              <OrderStatusBadge status={order.status} />
              <Text weight="semibold">{formatMoney(order.total, i18n.locale)}</Text>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Link>
  );
}

export function OrdersPage({ api }: { api: ApiClient }) {
  const { data, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(ordersInfiniteQueryOptions(api));
  const orders = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Stack as="section" className="p-4">
      <Heading level={1}>
        <Trans>Mes commandes</Trans>
      </Heading>
      {isPending ? (
        <Text aria-live="polite">
          <Trans>Chargement…</Trans>
        </Text>
      ) : isError && orders.length === 0 ? (
        <Text role="alert" tone="destructive">
          <Trans>Impossible de charger vos commandes.</Trans>
        </Text>
      ) : orders.length === 0 ? (
        <Text tone="muted">
          <Trans>Vous n'avez pas encore de commande</Trans>
        </Text>
      ) : (
        <Stack as="ul">
          {orders.map((order) => (
            <li key={order.id} className="list-none">
              <OrderRow order={order} />
            </li>
          ))}
        </Stack>
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
