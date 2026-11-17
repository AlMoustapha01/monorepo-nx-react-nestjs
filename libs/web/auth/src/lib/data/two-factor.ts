/** Rôles Better Auth qui gèrent l'organisation (comme le rôle `staff` de l'API). */
const MANAGER_ROLES = new Set(['owner', 'admin']);

/** Un rôle Better Auth en contient parfois plusieurs, séparés par des virgules. */
export const isManagerRole = (role: string | undefined): boolean =>
  role?.split(',').some((memberRole) => MANAGER_ROLES.has(memberRole.trim())) ?? false;

/** Secret de l'URI `otpauth://`, à saisir à la main dans une application sans appareil photo. */
export const secretOf = (totpURI: string): string =>
  new URL(totpURI).searchParams.get('secret') ?? '';

/** Actions sensibles : le mot de passe est redemandé avant. */
export const PASSWORD_ACTIONS = {
  enable: 'enable',
  disable: 'disable',
  backupCodes: 'backup-codes',
} as const;
export type PasswordAction = (typeof PASSWORD_ACTIONS)[keyof typeof PASSWORD_ACTIONS];

/** Clé de cache du rôle dans l'organisation active. */
export const activeMemberRoleKey = ['auth', 'active-member-role'] as const;

/** Clé de cache des passkeys du compte. */
export const passkeysKey = ['auth', 'passkeys'] as const;
