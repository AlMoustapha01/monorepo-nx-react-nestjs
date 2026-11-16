import { Global, Module } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { IntegrationEventRegistry } from './integration-event.registry';
import { IntegrationEventWorker } from './integration-event.worker';
import { DrizzleOutbox, Outbox } from './outbox';
import { OutboxRelay } from './outbox-relay';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    { provide: Outbox, useClass: DrizzleOutbox },
    IntegrationEventRegistry,
    OutboxRelay,
    IntegrationEventWorker,
  ],
  exports: [Outbox],
})
export class MessagingModule {}
