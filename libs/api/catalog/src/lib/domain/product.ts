import type { ProductStatus } from '@nx-react-nestjs/contracts';
import { CatalogError } from './catalog.errors';
import type { Money } from './money';

export interface ProductProps {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  price: Money;
  status: ProductStatus;
  /** Projection alimentée par les événements de commande, jamais modifiée par l'entité. */
  soldCount: number;
  /** Verrou optimiste : version de la ligne lue en base, avancée à chaque écriture. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface NewProduct {
  id: string;
  tenantId: string;
  sku: string;
  name: string;
  description: string | null;
  price: Money;
  now: Date;
}

/**
 * Cycle de vie : draft → active → archived. Un produit archivé est figé.
 * Seul un produit actif peut être vendu.
 */
export class Product {
  private constructor(private props: ProductProps) {}

  static create({ now, ...input }: NewProduct): Product {
    return new Product({
      ...input,
      status: 'draft',
      soldCount: 0,
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
  }

  /** Reconstruit un produit depuis la persistance, sans rejouer les règles de création. */
  static restore(props: ProductProps): Product {
    return new Product({ ...props });
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get sku(): string {
    return this.props.sku;
  }

  get name(): string {
    return this.props.name;
  }

  get description(): string | null {
    return this.props.description;
  }

  get price(): Money {
    return this.props.price;
  }

  get status(): ProductStatus {
    return this.props.status;
  }

  get soldCount(): number {
    return this.props.soldCount;
  }

  get version(): number {
    return this.props.version;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get isPurchasable(): boolean {
    return this.props.status === 'active';
  }

  publish(now: Date): void {
    this.assertNotArchived();
    if (this.props.price.isZero()) {
      throw new CatalogError(
        'PRODUCT_NOT_PUBLISHABLE',
        'A product cannot be published at a zero price',
        {
          productId: this.id,
        },
      );
    }
    if (this.props.status === 'active') {
      return;
    }
    this.props = { ...this.props, status: 'active', updatedAt: now };
  }

  archive(now: Date): void {
    if (this.props.status === 'archived') {
      return;
    }
    this.props = { ...this.props, status: 'archived', updatedAt: now };
  }

  changePrice(price: Money, now: Date): void {
    this.assertNotArchived();
    if (this.props.status === 'active' && price.isZero()) {
      throw new CatalogError('INVALID_PRICE', 'An active product cannot have a zero price', {
        productId: this.id,
      });
    }
    this.props = { ...this.props, price, updatedAt: now };
  }

  /** Appelé par le repository après une écriture réussie : la ligne porte la version suivante. */
  markPersisted(): void {
    this.props = { ...this.props, version: this.props.version + 1 };
  }

  private assertNotArchived(): void {
    if (this.props.status === 'archived') {
      throw new CatalogError('PRODUCT_ARCHIVED', 'An archived product cannot be modified', {
        productId: this.id,
      });
    }
  }
}
