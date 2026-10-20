import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Toute route est protégée par défaut ; ce décorateur est la seule façon d'en ouvrir une. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
