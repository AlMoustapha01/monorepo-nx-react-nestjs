/** Date et heure, à la seconde, dans la langue active. */
export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(iso),
  );
}
