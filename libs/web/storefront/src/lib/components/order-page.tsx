import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useSuspenseQuery } from '@tanstack/react-query';
import type { ApiClient } from '@nx-react-nestjs/web-data-access';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Heading,
  Stack,
  Text,
} from '@nx-react-nestjs/web-ui';

import { formatDateTime } from '../data/format-date';
import { formatMoney } from '../data/format-money';
import { orderQueryOptions } from '../data/orders';
import { useCancelOrder } from '../hooks/use-cancel-order';
import { OrderStatusBadge } from './order-status-badge';

interface OrderPageProps {
  api: ApiClient;
  orderId: string;
  canCancel: boolean;
}

export function OrderPage({ api, orderId, canCancel }: OrderPageProps) {
  const { t, i18n } = useLingui();
  const { data: order } = useSuspenseQuery(orderQueryOptions(api, orderId));
  const cancel = useCancelOrder(api);
  const [open, setOpen] = useState(false);

  return (
    <Stack as="section" className="p-4">
      <Stack direction="row" gap={4} align="center" justify="between" wrap>
        <Heading level={1}>
          <Trans>Commande {order.id}</Trans>
        </Heading>
        <OrderStatusBadge status={order.status} />
      </Stack>
      <Text tone="muted">{formatDateTime(order.createdAt, i18n.locale)}</Text>
      <Stack as="ul">
        {order.lines.map((line) => (
          <li key={line.productId} className="list-none">
            <Card>
              <CardContent>
                <Stack direction="row" gap={4} align="center" justify="between" wrap>
                  <Stack gap={1}>
                    <Text weight="semibold">{line.name}</Text>
                    <Text size="sm" tone="muted">
                      {line.quantity} × {formatMoney(line.unitPrice, i18n.locale)}
                    </Text>
                  </Stack>
                  <Text weight="semibold">{formatMoney(line.subtotal, i18n.locale)}</Text>
                </Stack>
              </CardContent>
            </Card>
          </li>
        ))}
      </Stack>
      <Text weight="semibold">
        <Trans>Total : {formatMoney(order.total, i18n.locale)}</Trans>
      </Text>
      {canCancel && order.status === 'placed' && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="destructive">
              <Trans>Annuler la commande</Trans>
            </Button>
          </DialogTrigger>
          <DialogContent closeLabel={t`Fermer`}>
            <DialogHeader>
              <DialogTitle>
                <Trans>Annuler cette commande ?</Trans>
              </DialogTitle>
              <DialogDescription>
                <Trans>Cette action est définitive.</Trans>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">
                  <Trans>Garder</Trans>
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                disabled={cancel.isPending}
                onClick={() => cancel.mutate(order.id, { onSuccess: () => setOpen(false) })}
              >
                <Trans>Oui, annuler</Trans>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </Stack>
  );
}
