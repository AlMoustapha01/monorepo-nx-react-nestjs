import { Injectable } from '@nestjs/common';
import { CatalogError } from '../../domain/catalog.errors';
import type { Product } from '../../domain/product';
import { ProductRepository } from '../product.repository';

@Injectable()
export class GetProduct {
  constructor(private readonly products: ProductRepository) {}

  async execute(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    if (!product) {
      // Même réponse qu'un produit d'un autre tenant : on ne révèle pas son existence.
      throw new CatalogError('PRODUCT_NOT_FOUND', `Product ${id} not found`, { productId: id });
    }
    return product;
  }
}
