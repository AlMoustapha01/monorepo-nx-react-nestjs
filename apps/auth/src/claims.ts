/** Rôles de membre d'organisation (Better Auth) qui donnent le rôle `staff` de l'API. */
const STAFF_MEMBER_ROLES = new Set(['owner', 'admin']);

export interface ClaimsInput {
  user: { email: string; emailVerified: boolean };
  /** Organisation active de la session, si l'utilisateur en est toujours membre. */
  membership?: { organizationId: string; role: string };
}

/**
 * Contenu de l'access token, au format attendu par l'API (JwtVerifier) : `tenant_id` est
 * l'organisation active, `roles` vient du rôle de membre. `sub` (l'ID utilisateur) est ajouté
 * par le plugin jwt. Rien d'autre : le token circule, il ne porte pas de donnée personnelle inutile.
 */
export function apiClaims({ user, membership }: ClaimsInput): Record<string, unknown> {
  // Better Auth stocke plusieurs rôles séparés par des virgules.
  const memberRoles = membership?.role.split(',').map((role) => role.trim()) ?? [];
  return {
    ...(membership && { tenant_id: membership.organizationId }),
    roles: memberRoles.some((role) => STAFF_MEMBER_ROLES.has(role)) ? ['staff'] : [],
    // Un email non vérifié n'est pas une identité : l'API ne s'en sert pas.
    ...(user.emailVerified && { email: user.email }),
  };
}
