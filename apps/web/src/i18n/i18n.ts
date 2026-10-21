import { i18n } from '@lingui/core';

import { messages as sourceMessages } from '../locales/fr/messages.po';
import { reportError } from '../report-error';
import { SOURCE_LOCALE, type Locale } from './locale';

type Messages = Record<string, string>;

/** Charge le catalogue d'une langue (chunk séparé, sauf la langue source). */
async function loadMessages(locale: Locale): Promise<Messages> {
  const module = (await import(`../locales/${locale}/messages.po`)) as { messages: Messages };
  return module.messages;
}

function apply(locale: Locale, messages: Messages): void {
  i18n.loadAndActivate({ locale, messages });
  document.documentElement.lang = locale;
}

/** Active une langue ; rejette si son catalogue ne se charge pas (l'état précédent est conservé). */
export async function activateLocale(
  locale: Locale,
  load: (locale: Locale) => Promise<Messages> = loadMessages,
): Promise<void> {
  apply(locale, locale === SOURCE_LOCALE ? sourceMessages : await load(locale));
}

/** Démarrage : en cas d'échec (déploiement en cours, réseau), signale l'erreur et retombe sur la langue source embarquée. */
export async function activateInitialLocale(
  locale: Locale,
  load?: (locale: Locale) => Promise<Messages>,
): Promise<void> {
  try {
    await activateLocale(locale, load);
  } catch (error) {
    reportError(error);
    apply(SOURCE_LOCALE, sourceMessages);
  }
}
