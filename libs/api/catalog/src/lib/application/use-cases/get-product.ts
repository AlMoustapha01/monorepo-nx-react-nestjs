import { Injectable } from '@nestjs/common';
import { RequestContext } from '@nx-react-nestjs/api-core';
import { CatalogError } from '../../domain/catalog.errors';
import type { Product } from '../../domain/product';
import { ProductRepository } from '../product.repository';

@Injectable()
export class GetProduct {
  constructor(
    private readonly products: ProductRepository,
    private readonly context: RequestContext,
  ) {}

  async execute(id: string): Promise<Product> {
    const product = await this.products.findById(id);
    // Un client ne voit que le catalogue publié : un brouillon ou un produit archivé
    // lui répond comme un produit inexistant (ou d'un autre tenant), sans rien révéler.
    if (!product || (!this.context.hasRole('staff') && product.status !== 'active')) {
      throw new CatalogError('PRODUCT_NOT_FOUND', `Product ${id} not found`, { productId: id });
    }
    return product;
  }
}
