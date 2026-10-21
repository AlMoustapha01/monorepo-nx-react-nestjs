import { Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor, RequestContext } from '@nx-react-nestjs/api-core';
import type { CursorPage, CursorPageQuery } from '@nx-react-nestjs/contracts';
import type { Product } from '../../domain/product';
import { ProductRepository } from '../product.repository';

@Injectable()
export class ListProducts {
  constructor(
    private readonly products: ProductRepository,
    private readonly context: RequestContext,
  ) {}

  async execute({ limit, cursor }: CursorPageQuery): Promise<CursorPage<Product>> {
    const page = await this.products.list({
      limit,
      after: cursor ? decodeCursor(cursor) : undefined,
      // Un client ne voit que les produits publiés ; le staff voit tout le catalogue.
      status: this.context.hasRole('staff') ? undefined : 'active',
    });
    const last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor: page.hasMore && last ? encodeCursor(last) : null,
    };
  }
}
