import { PersistenceMapper } from '@nx-react-nestjs/api-core';
import { currencySchema } from '@nx-react-nestjs/contracts';
import { Money } from '../domain/money';
import { Product } from '../domain/product';
import type { ProductRow } from './catalog.schema';

export class ProductMapper extends PersistenceMapper<Product, ProductRow> {
  toDomain(row: ProductRow): Product {
    return Product.restore({
      id: row.id,
      tenantId: row.tenantId,
      sku: row.sku,
      name: row.name,
      description: row.description,
      price: Money.of(row.priceAmountMinor, currencySchema.parse(row.priceCurrency)),
      status: row.status,
      soldCount: row.soldCount,
      version: row.version,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    });
  }

  toRow(product: Product): ProductRow {
    return {
      id: product.id,
      tenantId: product.tenantId,
      sku: product.sku,
      name: product.name,
      description: product.description,
      priceAmountMinor: product.price.amountMinor,
      priceCurrency: product.price.currency,
      status: product.status,
      soldCount: product.soldCount,
      version: product.version,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
    };
  }
}
