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

export const createOrganizationSchema = z.object({ name: z.string().trim().min(1).max(100) });
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const authUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  emailVerified: z.boolean(),
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

export const organizationSchema = z.object({ id: z.string(), name: z.string(), slug: z.string() });
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

export const accessTokenSchema = z.object({ token: z.string() });

/** Corps d'erreur de Better Auth : `code` stable (`INVALID_EMAIL_OR_PASSWORD`…), `message` lisible. */
export const authErrorSchema = z.object({ code: z.string().optional(), message: z.string() });
