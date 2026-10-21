import type { Money } from '@nx-react-nestjs/contracts';

/** Affiche un montant stocké en unités mineures ; la division ne sert qu'à l'affichage. */
export function formatMoney(money: Money, locale: string): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency: money.currency });
  const divisor = 10 ** (format.resolvedOptions().maximumFractionDigits ?? 2);
  return format.format(money.amountMinor / divisor);
}
