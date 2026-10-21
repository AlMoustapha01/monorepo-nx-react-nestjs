import type { GetToken } from './api-client';

/** Marge avant expiration : un token sur le point d'expirer est renouvelé avant l'appel. */
const REFRESH_MARGIN_MS = 60_000;

export interface AccessTokenSource {
  /** À passer en `getToken` du client API. */
  getToken: GetToken;
  /** Oublie le token : déconnexion, changement d'organisation (le tenant du token change). */
  clear(): void;
}

/**
 * Garde l'access token en mémoire seulement (jamais dans localStorage : un script injecté pourrait
 * le lire), et le renouvelle avant son expiration. Les appels simultanés partagent un seul
 * renouvellement.
 */
export function createAccessTokenSource(
  fetchToken: () => Promise<string | undefined>,
  now: () => number = Date.now,
): AccessTokenSource {
  let current: { token: string; expiresAt: number } | undefined;
  let pending: Promise<string | undefined> | undefined;

  function renew(): Promise<string | undefined> {
    pending ??= fetchToken()
      .then((token) => {
        current = token ? { token, expiresAt: expiryOf(token) } : undefined;
        return token;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  }

  return {
    getToken: ({ refresh }) => {
      if (!refresh && current && current.expiresAt - REFRESH_MARGIN_MS > now()) {
        return current.token;
      }
      return renew();
    },
    clear: () => {
      current = undefined;
    },
  };
}

/** `exp` du JWT, en ms. Illisible : traité comme expiré, donc renouvelé au prochain appel. */
function expiryOf(token: string): number {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : 0;
  } catch {
    return 0;
  }
}
