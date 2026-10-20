import { Module } from '@nestjs/common';
import { CatalogModule } from '@nx-react-nestjs/api-catalog';
import { OrderRepository } from './application/order.repository';
import { ProductCatalog } from './application/product-catalog.port';
import { CancelOrder } from './application/use-cases/cancel-order';
import { GetOrder } from './application/use-cases/get-order';
import { ListOrders } from './application/use-cases/list-orders';
import { PlaceOrder } from './application/use-cases/place-order';
import { OrdersController } from './http/orders.controller';
import { CatalogProductCatalog } from './infra/catalog-product-catalog.adapter';
import { DrizzleOrderRepository } from './infra/drizzle-order.repository';

@Module({
  // CatalogModule n'exporte que sa façade : c'est tout ce que ce domaine peut injecter.
  imports: [CatalogModule],
  controllers: [OrdersController],
  providers: [
    { provide: OrderRepository, useClass: DrizzleOrderRepository },
    { provide: ProductCatalog, useClass: CatalogProductCatalog },
    PlaceOrder,
    GetOrder,
    ListOrders,
    CancelOrder,
  ],
})
export class OrdersModule {}
