import { SetMetadata } from '@nestjs/common';

/**
 * Tout utilisateur authentifié est un client : il n'a pas besoin de rôle.
 * Un rôle ajoute des droits ; il vient de la claim `roles` du token.
 */
export const ROLES = ['staff'] as const;
export type Role = (typeof ROLES)[number];

export const REQUIRED_ROLES_KEY = 'auth:requiredRoles';

/** Réserve une route (ou un controller) aux principaux qui ont au moins un de ces rôles. */
export const RequireRole = (...roles: [Role, ...Role[]]) => SetMetadata(REQUIRED_ROLES_KEY, roles);
