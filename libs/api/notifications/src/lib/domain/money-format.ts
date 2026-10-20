import type { Currency } from '@nx-react-nestjs/contracts';

/** Convertit des unités mineures selon la devise : 1990 EUR → « 19,90 € », 1990 XOF → « 1 990 F CFA ». */
export function formatMoney(amountMinor: number, currency: Currency, locale = 'fr-FR'): string {
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const fractionDigits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(amountMinor / 10 ** fractionDigits);
}
