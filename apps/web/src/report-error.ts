/** Point d'accroche unique pour remonter les erreurs (Sentry plus tard). */
export function reportError(error: unknown, info?: { componentStack?: string }): void {
  console.error('[reportError]', error, info?.componentStack);
}
