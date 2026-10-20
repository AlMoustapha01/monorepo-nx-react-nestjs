import { Injectable, type OnModuleInit } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import {
  INTEGRATION_EVENT_HANDLER,
  type IntegrationEventHandler,
  type IntegrationEventHandlerMetadata,
} from './integration-event';

export interface RegisteredHandler extends IntegrationEventHandlerMetadata {
  instance: IntegrationEventHandler<IntegrationEventHandlerMetadata['definition']>;
}

/** Recense au démarrage les providers marqués @OnIntegrationEvent. */
@Injectable()
export class IntegrationEventRegistry implements OnModuleInit {
  private readonly byName = new Map<string, RegisteredHandler>();

  constructor(private readonly discovery: DiscoveryService) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const { instance, metatype } = wrapper;
      const metadata =
        metatype &&
        (Reflect.getMetadata(INTEGRATION_EVENT_HANDLER, metatype) as
          | IntegrationEventHandlerMetadata
          | undefined);
      if (!metadata || !instance) {
        continue;
      }
      if (this.byName.has(metadata.name)) {
        throw new Error(`Duplicate integration event handler name "${metadata.name}"`);
      }
      this.byName.set(metadata.name, { ...metadata, instance });
    }
  }

  handlersFor(type: string): RegisteredHandler[] {
    return [...this.byName.values()].filter((handler) => handler.definition.type === type);
  }

  handler(name: string): RegisteredHandler | undefined {
    return this.byName.get(name);
  }
}
