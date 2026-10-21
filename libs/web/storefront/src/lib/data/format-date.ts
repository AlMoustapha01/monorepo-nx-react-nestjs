/** Date et heure courtes dans la langue active. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}
