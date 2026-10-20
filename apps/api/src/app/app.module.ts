import { Module } from '@nestjs/common';
import { CatalogModule } from '@nx-react-nestjs/api-catalog';
import { CoreModule } from '@nx-react-nestjs/api-core';
import { NotificationsModule } from '@nx-react-nestjs/api-notifications';
import { OrdersModule } from '@nx-react-nestjs/api-orders';

@Module({
  imports: [CoreModule, CatalogModule, OrdersModule, NotificationsModule],
})
export class AppModule {}
