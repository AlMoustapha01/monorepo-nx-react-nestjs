import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { RequestContext } from '@nx-react-nestjs/api-core';
import type { CreateProductInput } from '@nx-react-nestjs/contracts';
import { CatalogError } from '../../domain/catalog.errors';
import { Money } from '../../domain/money';
import { Product } from '../../domain/product';
import { ProductRepository } from '../product.repository';

@Injectable()
export class CreateProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly context: RequestContext,
  ) {}

  async execute(input: CreateProductInput): Promise<Product> {
    if (await this.products.findBySku(input.sku)) {
      throw skuAlreadyExists(input.sku);
    }

    const product = Product.create({
      id: randomUUID(),
      tenantId: this.context.tenantId,
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      price: Money.of(input.price.amountMinor, input.price.currency),
      now: new Date(),
    });
    await this.products.insert(product);
    return product;
  }
}

export function skuAlreadyExists(sku: string): CatalogError {
  return new CatalogError('SKU_ALREADY_EXISTS', `A product with SKU ${sku} already exists`, {
    sku,
  });
}
