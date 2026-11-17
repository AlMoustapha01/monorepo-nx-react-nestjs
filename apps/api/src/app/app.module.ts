import { Module } from '@nestjs/common';
import { CoreModule } from '@nx-react-nestjs/api-core';
import { AuditModule } from '@nx-react-nestjs/api-audit';
// example:start
import { CatalogModule } from '@nx-react-nestjs/api-catalog';
import { NotificationsModule } from '@nx-react-nestjs/api-notifications';
import { OrdersModule } from '@nx-react-nestjs/api-orders';
// example:end

@Module({
  imports: [
    CoreModule,
    AuditModule,
    // example:start
    CatalogModule,
    OrdersModule,
    NotificationsModule,
    // example:end
  ],
})
export class AppModule {}
