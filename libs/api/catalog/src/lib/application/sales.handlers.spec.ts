import { randomUUID } from 'node:crypto';
import type { IntegrationEvent } from '@nx-react-nestjs/api-core';
import { createTestRequestContext } from '@nx-react-nestjs/api-core/testing';
import type {
  IntegrationEventDefinition,
  IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';
import { OrderCancelled, OrderPlaced } from '@nx-react-nestjs/contracts';
import { RecordSales, RevertSales } from './sales.handlers';
import { InMemoryProductRepository } from './testing/in-memory-product.repository';
import { CreateProduct } from './use-cases/create-product';
import { GetProduct } from './use-cases/get-product';

const context = createTestRequestContext();
const tenant = { userId: randomUUID(), tenantId: randomUUID() };

function eventOf<TDefinition extends IntegrationEventDefinition>(
  definition: TDefinition,
  payload: IntegrationEventPayload<TDefinition>,
): IntegrationEvent<TDefinition> {
  return {
    id: 'EVT-01jb4x7k2m9qwfzp3hd8',
    type: definition.type,
    tenantId: tenant.tenantId,
    actorId: tenant.userId,
    occurredAt: new Date().toISOString(),
    payload,
  };
}

describe('compteur de ventes du catalogue', () => {
  it('ajoute les ventes d’une commande puis les retire à son annulation', () =>
    context.runAs(tenant, async () => {
      const products = new InMemoryProductRepository(context);
      const { id } = await new CreateProduct(products, context).execute({
        sku: 'TEE-01',
        name: 'Tee-shirt',
        price: { amountMinor: 1990, currency: 'EUR' },
      });
      const line = { productId: id, sku: 'TEE-01', name: 'Tee-shirt', unitPriceMinor: 1990 };
      const orderId = 'ORD-01jb4x7k2m9qwfzp3hd8';
      const getProduct = new GetProduct(products);

      await new RecordSales(products).handle(
        eventOf(OrderPlaced, {
          orderId,
          customerId: tenant.userId,
          customerEmail: null,
          currency: 'EUR',
          totalMinor: 1990 * 3,
          lines: [{ ...line, quantity: 3 }],
          placedAt: new Date().toISOString(),
        }),
      );
      expect((await getProduct.execute(id)).soldCount).toBe(3);

      await new RevertSales(products).handle(
        eventOf(OrderCancelled, {
          orderId,
          lines: [{ productId: id, quantity: 3 }],
          cancelledAt: new Date().toISOString(),
        }),
      );
      expect((await getProduct.execute(id)).soldCount).toBe(0);
    }));

  it('ne descend jamais sous zéro', () =>
    context.runAs(tenant, async () => {
      const products = new InMemoryProductRepository(context);
      const { id } = await new CreateProduct(products, context).execute({
        sku: 'MUG-01',
        name: 'Mug',
        price: { amountMinor: 900, currency: 'EUR' },
      });
      await products.adjustSoldCounts([{ productId: id, delta: -5 }]);
      expect((await new GetProduct(products).execute(id)).soldCount).toBe(0);
    }));
});
