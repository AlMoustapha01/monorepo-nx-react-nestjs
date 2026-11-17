import { z } from 'zod';

/**
 * Contrat du service d'identité (apps/auth, Better Auth) tel que le front l'utilise : formulaires
 * et réponses. Les limites suivent celles de Better Auth (mot de passe de 8 à 128 caractères).
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

// Normalisé avant la validation : " Ada@Shop.test " est une adresse valide.
const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const signInSchema = z.object({ email, password: z.string().min(1) });
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({ name: z.string().trim().min(1).max(100), email, password });
export type SignUpInput = z.infer<typeof signUpSchema>;

export const requestPasswordResetSchema = z.object({ email });
export type RequestPasswordResetInput = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({ password });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/** Réponse de la connexion : `twoFactorRedirect` quand le mot de passe ne suffit pas. */
export const signInResultSchema = z.object({ twoFactorRedirect: z.boolean().optional() });

/** Code de l'application d'authentification (TOTP, 6 chiffres) ou code de secours. */
export const totpCodeSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/),
});
export const backupCodeSchema = z.object({ code: z.string().trim().min(1).max(64) });

/** Activation de la 2FA : secret à scanner (URI `otpauth://`) et codes de secours, montrés une fois. */
export const twoFactorSetupSchema = z.object({
  totpURI: z.string(),
  backupCodes: z.array(z.string()),
});
export type TwoFactorSetup = z.infer<typeof twoFactorSetupSchema>;

/** Mot de passe redemandé avant une action sensible (activer, désactiver la 2FA, nouveaux codes). */
export const confirmPasswordSchema = z.object({ password: z.string().min(1) });

export const createOrganizationSchema = z.object({ name: z.string().trim().min(1).max(100) });
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
  twoFactorEnabled: z.boolean().nullish(),
});
export type AuthUser = z.infer<typeof authUserSchema>;

/** `null` sans session (cookie absent ou expiré). */
export const authSessionSchema = z
  .object({
    user: authUserSchema,
    session: z.object({ activeOrganizationId: z.string().nullish() }),
  })
  .nullable();
export type AuthSession = z.infer<typeof authSessionSchema>;

export const organizationSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  /** Sans 2FA, un membre n'a pas accès à ce tenant (ADR 0017). */
  requireTwoFactor: z.boolean().nullish(),
});
export type Organization = z.infer<typeof organizationSchema>;

export const invitationSchema = z.object({
  id: z.string(),
  email: z.string(),
  role: z.string(),
  status: z.string(),
  organizationId: z.string(),
  organizationName: z.string(),
});
export type Invitation = z.infer<typeof invitationSchema>;

/** Membre de l'organisation active, tel que l'affiche le front (Better Auth : `organization/list-members`). */
export const organizationMembersSchema = z
  .object({
    members: z.array(
      z.object({
        userId: z.string(),
        role: z.string(),
        user: z.object({ name: z.string(), email: z.string() }),
      }),
    ),
  })
  .transform(({ members }) =>
    members.map(({ userId, role, user }) => ({ userId, role, name: user.name, email: user.email })),
  );
export type OrganizationMember = z.output<typeof organizationMembersSchema>[number];

export const accessTokenSchema = z.object({ token: z.string() });

/** Corps d'erreur de Better Auth : `code` stable (`INVALID_EMAIL_OR_PASSWORD`…), `message` lisible. */
export const authErrorSchema = z.object({ code: z.string().optional(), message: z.string() });
