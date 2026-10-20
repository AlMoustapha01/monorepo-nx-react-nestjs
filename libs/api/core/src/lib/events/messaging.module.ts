import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { DiscoveryModule } from '@nestjs/core';
import { Queue } from 'bullmq';
import { AppConfig } from '../config/app-config';
import { IntegrationEventRegistry } from './integration-event.registry';
import {
  DEFAULT_JOB_OPTIONS,
  INTEGRATION_EVENTS_QUEUE,
  INTEGRATION_EVENTS_QUEUE_NAME,
  InjectIntegrationEventsQueue,
  type IntegrationEventJob,
  redisConnection,
} from './integration-event.queue';
import { IntegrationEventWorker } from './integration-event.worker';
import { DrizzleOutbox, Outbox } from './outbox';
import { OutboxRelay } from './outbox-relay';

@Global()
@Module({
  imports: [DiscoveryModule],
  providers: [
    {
      provide: INTEGRATION_EVENTS_QUEUE,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new Queue<IntegrationEventJob>(INTEGRATION_EVENTS_QUEUE_NAME, {
          connection: redisConnection(config.get('REDIS_URL')),
          defaultJobOptions: DEFAULT_JOB_OPTIONS,
        }),
    },
    { provide: Outbox, useClass: DrizzleOutbox },
    IntegrationEventRegistry,
    OutboxRelay,
    IntegrationEventWorker,
  ],
  exports: [Outbox, INTEGRATION_EVENTS_QUEUE],
})
export class MessagingModule implements OnApplicationShutdown {
  constructor(@InjectIntegrationEventsQueue() private readonly queue: Queue<IntegrationEventJob>) {}

  async onApplicationShutdown(): Promise<void> {
    await this.queue.close();
  }
}
