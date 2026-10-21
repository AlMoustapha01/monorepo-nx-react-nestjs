import { formatMoney } from './format-money';

const normalize = (value: string) => value.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it('formats euros in French', () => {
    const result = formatMoney({ amountMinor: 1990, currency: 'EUR' }, 'fr');
    expect(result).toContain('19,90');
    expect(result).toContain('€');
  });

  it('formats euros in English', () => {
    expect(formatMoney({ amountMinor: 1990, currency: 'EUR' }, 'en')).toContain('19.90');
  });

  it('does not divide currencies without minor units', () => {
    const result = normalize(formatMoney({ amountMinor: 1500, currency: 'XOF' }, 'fr'));
    expect(result).toMatch(/1 500/);
    expect(result).not.toContain('15,00');
  });
});
