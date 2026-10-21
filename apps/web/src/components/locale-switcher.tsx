import { useLingui } from '@lingui/react/macro';
import { toast } from 'sonner';
import { Button } from '@nx-react-nestjs/web-ui';

import { activateLocale } from '../i18n/i18n';
import { reportError } from '../report-error';
import { LOCALES, storeLocale, type Locale } from '../i18n/locale';

export function LocaleSwitcher() {
  const { t, i18n } = useLingui();

  const select = async (locale: Locale) => {
    try {
      await activateLocale(locale);
    } catch (error) {
      // Catalogue indisponible : on garde la langue courante et on ne mémorise rien.
      reportError(error);
      toast.error(t`Impossible de changer de langue.`);
      return;
    }
    storeLocale(locale);
  };

  return (
    <fieldset aria-label={t`Langue`} className="m-0 flex min-w-0 gap-1 border-0 p-0">
      {LOCALES.map((locale) => (
        <Button
          key={locale}
          size="sm"
          variant={i18n.locale === locale ? 'default' : 'outline'}
          aria-pressed={i18n.locale === locale}
          onClick={() => void select(locale)}
        >
          {locale}
        </Button>
      ))}
    </fieldset>
  );
}
