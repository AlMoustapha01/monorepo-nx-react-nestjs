import { i18n } from '@lingui/core';

import { activateInitialLocale } from './i18n';

afterEach(() => {
  vi.restoreAllMocks();
});

// Variable : évite que l'extraction Lingui prenne cette clé pour un message de l'app.
const KEY = 'Réessayer';

describe('activateInitialLocale', () => {
  it('falls back to the embedded fr catalog and reports when loading fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await activateInitialLocale('en', () => Promise.reject(new Error('chunk 404')));
    expect(i18n.locale).toBe('fr');
    expect(i18n._(KEY)).toBe('Réessayer');
    expect(document.documentElement.lang).toBe('fr');
    expect(spy.mock.calls.some((c) => c[0] === '[reportError]')).toBe(true);
  });

  it('activates the requested locale when loading succeeds', async () => {
    await activateInitialLocale('en', () => Promise.resolve({ [KEY]: 'Retry' }));
    expect(i18n.locale).toBe('en');
    expect(i18n._(KEY)).toBe('Retry');
  });
});
