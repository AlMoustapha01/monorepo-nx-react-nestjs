import { Module } from '@nestjs/common';
import { CatalogFacade } from './application/catalog.facade';
import { ProductRepository } from './application/product.repository';
import { RecordSales, RevertSales } from './application/sales.handlers';
import { CreateProduct } from './application/use-cases/create-product';
import { GetProduct } from './application/use-cases/get-product';
import { ListProducts } from './application/use-cases/list-products';
import {
  ArchiveProduct,
  ChangeProductPrice,
  PublishProduct,
} from './application/use-cases/update-product';
import { ProductsController } from './http/products.controller';
import { DrizzleProductRepository } from './infra/drizzle-product.repository';

@Module({
  controllers: [ProductsController],
  providers: [
    { provide: ProductRepository, useClass: DrizzleProductRepository },
    CreateProduct,
    GetProduct,
    ListProducts,
    ChangeProductPrice,
    PublishProduct,
    ArchiveProduct,
    CatalogFacade,
    RecordSales,
    RevertSales,
  ],
  exports: [CatalogFacade],
})
export class CatalogModule {}
