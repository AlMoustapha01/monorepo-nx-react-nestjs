import type { QueryClient } from '@tanstack/react-query';
import { redirect } from '@tanstack/react-router';
import type { AccessTokenSource, AuthClient } from '@nx-react-nestjs/web-data-access';
import { sessionQueryOptions } from '@nx-react-nestjs/web-auth';

/** Identifiants de routes (TanStack Router), pour `useMatch` et `useRouteContext`. */
export const ROOT_ROUTE = '__root__';
export const AUTHENTICATED_ROUTE = '/_authenticated';

export interface SessionContext {
  auth: AuthClient;
  tokens: AccessTokenSource;
  /** VITE_DEV_TOKEN défini (dev seulement) : aucune connexion demandée. */
  devMode: boolean;
}

interface Context {
  queryClient: QueryClient;
  session: SessionContext;
}

/** Session à jour (relue si elle a plus d'une minute) ; `null` sans session. */
export function loadSession({ queryClient, session }: Context) {
  return queryClient.fetchQuery(sessionQueryOptions(session.auth));
}

/** `beforeLoad` d'une page qui exige une session : sinon, connexion puis retour ici. */
export async function requireSession(context: Context, returnTo: string) {
  const current = await loadSession(context);
  if (!current) throw redirect({ to: '/connexion', search: { redirect: returnTo } });
  return current;
}

/**
 * Connexion, déconnexion, organisation créée ou rejointe : le token et toutes les données en cache
 * appartiennent à l'ancien utilisateur ou à l'ancien tenant. À appeler avant de quitter la page.
 */
export function resetSession({ queryClient, session }: Context): void {
  session.tokens.clear();
  queryClient.clear();
}

/**
 * Changement d'organisation sans quitter la page : `clear()` laisserait les composants affichés
 * avec les données de l'ancien tenant. `resetQueries()` les vide toutes et recharge celles qui
 * sont affichées, avec un token du nouveau tenant.
 */
export async function reloadForNewTenant({ queryClient, session }: Context): Promise<void> {
  session.tokens.clear();
  await queryClient.resetQueries();
}

/** URL absolue d'une page de l'app, pour les liens des emails (confirmation, mot de passe). */
export function appUrl(path: string): string {
  return new URL(path, window.location.origin).href;
}

export const RESET_PASSWORD_PATH = '/reinitialiser-mot-de-passe';

/**
 * Destination après connexion : un chemin de l'app seulement. Une URL absolue ou `//hôte`
 * ferait de la page de connexion un redirecteur ouvert vers un site tiers.
 */
export function safeRedirect(target: string | undefined): string {
  return target?.startsWith('/') && !target.startsWith('//') && !target.startsWith('/\\')
    ? target
    : '/';
}
