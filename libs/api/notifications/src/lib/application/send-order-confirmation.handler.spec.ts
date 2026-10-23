import { randomUUID } from 'node:crypto';
import type { IntegrationEvent } from '@nx-react-nestjs/api-core';
import { RecordingMailer, StaticFeatureFlags } from '@nx-react-nestjs/api-core/testing';
import type { OrderPlaced } from '@nx-react-nestjs/contracts';
import { SendOrderConfirmation } from './send-order-confirmation.handler';

const event = (customerEmail: string | null): IntegrationEvent<typeof OrderPlaced> => ({
  id: 'EVT-01jb4x7k2m9qwfzp3hd8',
  type: 'orders.order-placed.v1',
  tenantId: randomUUID(),
  actorId: randomUUID(),
  occurredAt: new Date().toISOString(),
  payload: {
    orderId: 'ORD-01jb4x7k2m9qwfzp3hd8',
    customerId: randomUUID(),
    customerEmail,
    currency: 'EUR',
    totalMinor: 1990,
    lines: [
      {
        productId: 'PRD-01jb4x7k2m9qwfzp3hd8',
        sku: 'TEE-01',
        name: 'Tee-shirt',
        unitPriceMinor: 1990,
        quantity: 1,
      },
    ],
    placedAt: new Date().toISOString(),
  },
});

describe('SendOrderConfirmation', () => {
  it('envoie la confirmation au client, avec l’ID de l’événement comme clé d’idempotence', async () => {
    const mailer = new RecordingMailer();
    await new SendOrderConfirmation(mailer, new StaticFeatureFlags()).handle(
      event('ada@example.com'),
    );

    expect(mailer.sent).toEqual([
      expect.objectContaining({
        to: 'ada@example.com',
        idempotencyKey: 'EVT-01jb4x7k2m9qwfzp3hd8',
        subject: 'Votre commande ORD-01jb4x7k2m9qwfzp3hd8 est confirmée',
      }),
    ]);
  });

  it('n’envoie rien quand l’email du client est inconnu', async () => {
    const mailer = new RecordingMailer();
    await new SendOrderConfirmation(mailer, new StaticFeatureFlags()).handle(event(null));
    expect(mailer.sent).toEqual([]);
  });

  it('n’envoie rien quand le coupe-circuit est activé', async () => {
    const mailer = new RecordingMailer();
    const flags = new StaticFeatureFlags().set('notifications.order-confirmation-email', false);
    await new SendOrderConfirmation(mailer, flags).handle(event('ada@example.com'));
    expect(mailer.sent).toEqual([]);
  });
});
