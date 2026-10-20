import { domainIdSchema } from './domain-id';

describe('domainIdSchema', () => {
  const orderId = domainIdSchema('ORD');

  it('accepte un ID au bon format', () => {
    expect(orderId.safeParse('ORD-01jb4x7k2m9qwfzp3hd8').success).toBe(true);
  });

  it('refuse un autre préfixe, une autre longueur ou un caractère hors alphabet', () => {
    for (const invalid of [
      'PRD-01jb4x7k2m9qwfzp3hd8',
      'ORD-01jb4x7k2m9qwfzp3hd',
      'ORD-01JB4X7K2M9QWFZP3HD8',
      'ORD-01jb4x7k2m9qwfzp3hdi',
      'ord-01jb4x7k2m9qwfzp3hd8',
      '6f1c2a4e-8b0d-4c4e-9a51-2f7e3c1d9b20',
    ]) {
      expect(orderId.safeParse(invalid).success).toBe(false);
    }
  });

  it('refuse un préfixe mal formé à la déclaration', () => {
    expect(() => domainIdSchema('ord')).toThrow('Invalid domain id prefix');
  });
});
