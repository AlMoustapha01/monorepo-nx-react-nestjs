import { Injectable } from '@nestjs/common';
import type { ChangeProductPriceInput } from '@nx-react-nestjs/contracts';
import { Money } from '../../domain/money';
import type { Product } from '../../domain/product';
import { ProductRepository } from '../product.repository';
import { GetProduct } from './get-product';

/** Charge, applique une règle du domaine, persiste : le même squelette pour chaque commande. */
// @Injectable() ici pour que TypeScript émette les types du constructeur hérités par les sous-classes.
@Injectable()
abstract class ProductCommand<TInput> {
  constructor(
    private readonly getProduct: GetProduct,
    private readonly products: ProductRepository,
  ) {}

  async execute(id: string, input: TInput): Promise<Product> {
    const product = await this.getProduct.execute(id);
    this.apply(product, input, new Date());
    await this.products.update(product);
    return product;
  }

  protected abstract apply(product: Product, input: TInput, now: Date): void;
}

@Injectable()
export class ChangeProductPrice extends ProductCommand<ChangeProductPriceInput> {
  protected apply(product: Product, { price }: ChangeProductPriceInput, now: Date): void {
    product.changePrice(Money.of(price.amountMinor, price.currency), now);
  }
}

@Injectable()
export class PublishProduct extends ProductCommand<void> {
  protected apply(product: Product, _input: void, now: Date): void {
    product.publish(now);
  }
}

@Injectable()
export class ArchiveProduct extends ProductCommand<void> {
  protected apply(product: Product, _input: void, now: Date): void {
    product.archive(now);
  }
}
