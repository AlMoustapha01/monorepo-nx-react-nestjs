import { Trans } from '@lingui/react/macro';
import type { OrderStatus } from '@nx-react-nestjs/contracts';
import { Badge } from '@nx-react-nestjs/web-ui';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return status === 'placed' ? (
    <Badge variant="default">
      <Trans>Passée</Trans>
    </Badge>
  ) : (
    <Badge variant="secondary">
      <Trans>Annulée</Trans>
    </Badge>
  );
}
