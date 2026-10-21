export const LOCALES = ['fr', 'en'] as const;
export type Locale = (typeof LOCALES)[number];
/** @public Langue source des catalogues (alignée sur `lingui.config.ts`). */
export const SOURCE_LOCALE: Locale = 'fr';

const STORAGE_KEY = 'app.locale';

function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

export function resolveLocale(
  stored: string | null,
  navigatorLanguages: readonly string[],
): Locale {
  if (isLocale(stored)) return stored;
  for (const language of navigatorLanguages) {
    const base = language.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return SOURCE_LOCALE;
}

export function readStoredLocale(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // Stockage bloqué (navigation privée) : on retombe sur la détection navigateur.
    return null;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Préférence non persistée : sans gravité.
  }
}
