import type { Currency, OrderStatus } from '@nx-react-nestjs/contracts';
import { OrdersError } from './orders.errors';

/**
 * Ligne figée au moment de la commande : SKU, nom et prix sont copiés depuis le catalogue,
 * pour qu'un changement de prix ultérieur ne modifie pas une commande passée.
 */
export interface OrderLine {
  readonly productId: string;
  readonly sku: string;
  readonly name: string;
  readonly unitPriceMinor: number;
  readonly quantity: number;
}

export interface OrderProps {
  id: string;
  tenantId: string;
  customerId: string;
  currency: Currency;
  status: OrderStatus;
  lines: readonly OrderLine[];
  createdAt: Date;
  updatedAt: Date;
}

export interface NewOrder {
  id: string;
  tenantId: string;
  customerId: string;
  currency: Currency;
  lines: readonly OrderLine[];
  now: Date;
}

/** Cycle de vie : placed → cancelled. Les lignes ne changent plus après la création. */
export class Order {
  private constructor(private props: OrderProps) {}

  static place({ now, ...input }: NewOrder): Order {
    if (input.lines.length === 0) {
      throw new OrdersError('EMPTY_ORDER', 'An order needs at least one line');
    }
    const productIds = input.lines.map((line) => line.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new OrdersError('DUPLICATE_ORDER_LINE', 'A product can appear only once per order', {
        productIds,
      });
    }
    for (const line of input.lines) {
      assertValidLine(line);
    }
    return new Order({
      ...input,
      lines: input.lines.map((line) => ({ ...line })),
      status: 'placed',
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstruit une commande depuis la persistance, sans rejouer les règles de création. */
  static restore(props: OrderProps): Order {
    return new Order({ ...props, lines: props.lines.map((line) => ({ ...line })) });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get customerId(): string {
    return this.props.customerId;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get status(): OrderStatus {
    return this.props.status;
  }

  get lines(): readonly OrderLine[] {
    return this.props.lines;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  /** Total en unités mineures, toujours recalculé depuis les lignes. */
  get totalMinor(): number {
    return this.props.lines.reduce((total, line) => total + lineSubtotalMinor(line), 0);
  }

  cancel(now: Date): void {
    if (this.props.status === 'cancelled') {
      return;
    }
    this.props = { ...this.props, status: 'cancelled', updatedAt: now };
  }
}

export function lineSubtotalMinor(line: OrderLine): number {
  return line.unitPriceMinor * line.quantity;
}

function assertValidLine(line: OrderLine): void {
  const validQuantity = Number.isSafeInteger(line.quantity) && line.quantity > 0;
  const validPrice = Number.isSafeInteger(line.unitPriceMinor) && line.unitPriceMinor >= 0;
  if (!validQuantity || !validPrice) {
    throw new OrdersError('INVALID_ORDER_LINE', 'Quantity and unit price must be valid integers', {
      productId: line.productId,
    });
  }
}
