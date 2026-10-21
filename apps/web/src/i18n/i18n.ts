import { i18n } from '@lingui/core';

import type { Locale } from './locale';

export async function activateLocale(locale: Locale): Promise<void> {
  const { messages } = (await import(`../locales/${locale}/messages.po`)) as {
    messages: Record<string, string>;
  };
  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
}
