/** Rôles de membre d'organisation (Better Auth) qui donnent le rôle `staff` de l'API. */
const STAFF_MEMBER_ROLES = new Set(['owner', 'admin']);

/** Connexion par passkey : la session qu'elle ouvre vaut la 2FA qu'une organisation exige (ADR 0018). */
export const PASSKEY_SIGN_IN_PATH = '/passkey/verify-authentication';

export interface ClaimsInput {
  user: { email: string; emailVerified: boolean; twoFactorEnabled?: boolean | null };
  /** Organisation active de la session, si l'utilisateur en est toujours membre. */
  membership?: { organizationId: string; role: string; requireTwoFactor?: boolean | null };
  /** Session pour laquelle le token est émis. */
  session?: { passkeySignIn?: boolean | null };
}

/**
 * Contenu de l'access token, au format attendu par l'API (JwtVerifier) : `tenant_id` est
 * l'organisation active, `roles` vient du rôle de membre. `sub` (l'ID utilisateur) est ajouté
 * par le plugin jwt. Une organisation qui exige la 2FA n'est pas donnée à un membre qui ne l'a pas. Rien d'autre : le token circule, il ne porte pas de donnée personnelle inutile.
 */
export function apiClaims({
  user,
  membership: active,
  session,
}: ClaimsInput): Record<string, unknown> {
  // Organisation qui exige la 2FA, membre sans 2FA ni session ouverte par passkey : aucun accès à ce
  // tenant tant qu'il ne l'a pas activée.
  const secondFactor = user.twoFactorEnabled === true || session?.passkeySignIn === true;
  const membership = active?.requireTwoFactor && !secondFactor ? undefined : active;
  // Better Auth stocke plusieurs rôles séparés par des virgules.
  const memberRoles = membership?.role.split(',').map((role) => role.trim()) ?? [];
  return {
    ...(membership && { tenant_id: membership.organizationId }),
    roles: memberRoles.some((role) => STAFF_MEMBER_ROLES.has(role)) ? ['staff'] : [],
    // Un email non vérifié n'est pas une identité : l'API ne s'en sert pas.
    ...(user.emailVerified && { email: user.email }),
  };
}
