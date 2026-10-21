import { readStoredLocale, resolveLocale, storeLocale } from './locale';

describe('resolveLocale', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers a valid stored locale', () => {
    expect(resolveLocale('en', ['fr-FR'])).toBe('en');
  });

  it('ignores an invalid stored value', () => {
    expect(resolveLocale('de', ['en-US'])).toBe('en');
  });

  it('maps en-US and fr-CA to their base locale', () => {
    expect(resolveLocale(null, ['en-US'])).toBe('en');
    expect(resolveLocale(null, ['fr-CA'])).toBe('fr');
  });

  it('falls back to fr for unsupported languages', () => {
    expect(resolveLocale(null, ['de-DE'])).toBe('fr');
    expect(resolveLocale(null, [])).toBe('fr');
  });

  it('readStoredLocale returns null when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readStoredLocale()).toBeNull();
  });

  it('storeLocale does not throw when localStorage throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => storeLocale('en')).not.toThrow();
  });
});
