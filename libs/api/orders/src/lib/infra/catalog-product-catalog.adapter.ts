import { Injectable } from '@nestjs/common';
import { CatalogFacade, type ProductSnapshot } from '@nx-react-nestjs/api-catalog';
import { ProductCatalog } from '../application/product-catalog.port';

/** Branche le port des commandes sur la façade publique du catalogue (jamais ses internes). */
@Injectable()
export class CatalogProductCatalog extends ProductCatalog {
  constructor(private readonly catalog: CatalogFacade) {
    super();
  }

  getProducts(ids: readonly string[]): Promise<ProductSnapshot[]> {
    return this.catalog.getProducts(ids);
  }
}
