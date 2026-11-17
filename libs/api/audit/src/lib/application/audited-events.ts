// example:start
import { OrderCancelled, OrderPlaced } from '@nx-react-nestjs/contracts';
// example:end
import type { AuditedEventHandler } from './audit-event';
// example:start
import { auditEvent } from './audit-event';
// example:end

/**
 * Événements d'intégration inscrits au journal d'audit, un handler chacun. Le domaine émetteur n'en sait rien :
 * l'audit ne dépend que du contrat de l'événement. Auditer un nouvel événement : une entrée ici, avec un nom
 * `audit.<domaine>.<fait>` qui ne changera plus. Les actions du service d'identité s'écrivent dans apps/auth.
 */
export const AUDITED_EVENT_HANDLERS: readonly AuditedEventHandler[] = [
  // example:start
  auditEvent(OrderPlaced, {
    name: 'audit.orders.order-placed',
    describe: ({ orderId, currency, totalMinor, lines }) => ({
      action: 'orders.order-placed',
      resource: { type: 'order', id: orderId },
      details: { totalMinor, currency, lines: lines.length },
    }),
  }),
  auditEvent(OrderCancelled, {
    name: 'audit.orders.order-cancelled',
    describe: ({ orderId }) => ({
      action: 'orders.order-cancelled',
      resource: { type: 'order', id: orderId },
    }),
  }),
  // example:end
];
