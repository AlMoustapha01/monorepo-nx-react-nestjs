import { formatMoney } from './money-format';
import { orderConfirmationEmail } from './order-confirmation';

/** Intl insère des espaces insécables : on les normalise pour comparer. */
const plain = (value: string) => value.replace(/[  ]/g, ' ');

describe('formatMoney', () => {
  it('respects the number of decimals of the currency', () => {
    expect(plain(formatMoney(1990, 'EUR'))).toBe('19,90 €');
    expect(plain(formatMoney(1990, 'USD'))).toBe('19,90 $US');
    expect(plain(formatMoney(1990, 'XOF'))).toBe('1 990 F CFA');
  });
});

describe('orderConfirmationEmail', () => {
  const order = {
    orderId: 'ORD-01jb4x7k2m9qwfzp3hd8',
    currency: 'EUR' as const,
    totalMinor: 4880,
    lines: [
      { name: 'Tee-shirt', quantity: 2, unitPriceMinor: 1990 },
      { name: 'Mug <b>XL</b>', quantity: 1, unitPriceMinor: 900 },
    ],
  };

  it('summarizes the lines and the total', () => {
    const email = orderConfirmationEmail(order);
    expect(email.subject).toBe('Votre commande ORD-01jb4x7k2m9qwfzp3hd8 est confirmée');
    expect(plain(email.text)).toContain('2 × Tee-shirt : 39,80 €');
    expect(plain(email.text)).toContain('Total : 48,80 €');
  });

  it('escapes HTML coming from product names', () => {
    const { html } = orderConfirmationEmail(order);
    expect(html).toContain('Mug &lt;b&gt;XL&lt;/b&gt;');
    expect(html).not.toContain('<b>XL</b>');
  });
});
