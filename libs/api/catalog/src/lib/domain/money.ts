import type { Currency } from '@nx-react-nestjs/contracts';
import { CatalogError } from './catalog.errors';

/** Montant en unités mineures (centimes) : jamais de flottant pour de l'argent. */
export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: Currency,
  ) {}

  static of(amountMinor: number, currency: Currency): Money {
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
      throw new CatalogError(
        'INVALID_PRICE',
        'A price must be a non-negative integer amount in minor units',
        { amountMinor },
      );
    }
    return new Money(amountMinor, currency);
  }

  isZero(): boolean {
    return this.amountMinor === 0;
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }
}
