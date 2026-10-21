import { assertExpectedVersion, etagFor, parseIfMatch } from './entity-version';

describe('verrou optimiste HTTP', () => {
  it('lit la version d’un If-Match fort ou faible', () => {
    expect(parseIfMatch(etagFor(3))).toBe(3);
    expect(parseIfMatch('W/"12"')).toBe(12);
  });

  it('n’impose rien sans If-Match ou avec *', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
    expect(parseIfMatch('*')).toBeUndefined();
  });

  it('refuse un If-Match mal formé', () => {
    for (const header of ['3', '"abc"', '"1", "2"']) {
      expect(() => parseIfMatch(header)).toThrow(
        expect.objectContaining({ code: 'INVALID_IF_MATCH' }),
      );
    }
  });

  it('renvoie 412 quand la version attendue n’est plus la bonne', () => {
    expect(() => assertExpectedVersion(2, 2)).not.toThrow();
    expect(() => assertExpectedVersion(undefined, 5)).not.toThrow();
    expect(() => assertExpectedVersion(1, 2)).toThrow(
      expect.objectContaining({ code: 'PRECONDITION_FAILED', kind: 'PRECONDITION_FAILED' }),
    );
  });
});
