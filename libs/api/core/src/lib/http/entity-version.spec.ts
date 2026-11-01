import { assertExpectedVersion, etagFor, parseIfMatch } from './entity-version';

describe('HTTP optimistic locking', () => {
  it('reads the version from a strong or weak If-Match', () => {
    expect(parseIfMatch(etagFor(3))).toBe(3);
    expect(parseIfMatch('W/"12"')).toBe(12);
  });

  it('imposes nothing without If-Match or with *', () => {
    expect(parseIfMatch(undefined)).toBeUndefined();
    expect(parseIfMatch('*')).toBeUndefined();
  });

  it('rejects a malformed If-Match', () => {
    for (const header of ['3', '"abc"', '"1", "2"']) {
      expect(() => parseIfMatch(header)).toThrow(
        expect.objectContaining({ code: 'INVALID_IF_MATCH' }),
      );
    }
  });

  it('returns 412 when the expected version is no longer current', () => {
    expect(() => assertExpectedVersion(2, 2)).not.toThrow();
    expect(() => assertExpectedVersion(undefined, 5)).not.toThrow();
    expect(() => assertExpectedVersion(1, 2)).toThrow(
      expect.objectContaining({ code: 'PRECONDITION_FAILED', kind: 'PRECONDITION_FAILED' }),
    );
  });
});
