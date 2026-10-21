import {
  accessTokenSchema,
  authErrorSchema,
  authSessionSchema,
  invitationSchema,
  organizationSchema,
  type AuthSession,
  type CreateOrganizationInput,
  type Invitation,
  type Organization,
  type SignInInput,
  type SignUpInput,
} from '@nx-react-nestjs/contracts';
import { z } from 'zod';
import { ApiError } from './api-error';

export interface AuthClientOptions {
  /** URL du service d'identité, sans `/api/auth` (ex. `http://localhost:3100`). */
  baseUrl: string;
  /** Délai maximal d'une requête, 10 000 ms par défaut. */
  timeoutMs?: number;
}

/**
 * Client du service d'identité (apps/auth, Better Auth). La session est un cookie du service
 * (`credentials: 'include'`) ; l'API, elle, reçoit un access token court (`getAccessToken`).
 * Erreurs : `ApiError`, avec le `code` de Better Auth (`INVALID_EMAIL_OR_PASSWORD`,
 * `EMAIL_NOT_VERIFIED`…) ou TIMEOUT / NETWORK_ERROR / HTTP_ERROR.
 */
export interface AuthClient {
  getSession(signal?: AbortSignal): Promise<AuthSession>;
  signIn(input: SignInInput): Promise<void>;
  /** `callbackURL` : page du front ouverte après le clic sur le lien de vérification. */
  signUp(input: SignUpInput, callbackURL: string): Promise<void>;
  signOut(): Promise<void>;
  sendVerificationEmail(email: string, callbackURL: string): Promise<void>;
  /** `redirectTo` : page du front qui reçoit `?token=` pour choisir le nouveau mot de passe. */
  requestPasswordReset(email: string, redirectTo: string): Promise<void>;
  resetPassword(password: string, token: string): Promise<void>;
  listOrganizations(signal?: AbortSignal): Promise<Organization[]>;
  createOrganization(input: CreateOrganizationInput): Promise<Organization>;
  setActiveOrganization(organizationId: string): Promise<void>;
  getInvitation(invitationId: string, signal?: AbortSignal): Promise<Invitation>;
  acceptInvitation(invitationId: string): Promise<void>;
  /** Access token de 15 min pour l'API ; `undefined` sans session. */
  getAccessToken(): Promise<string | undefined>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const ignored = z.unknown();

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = `${options.baseUrl.replace(/\/+$/, '')}/api/auth`;

  async function call<T>(
    path: string,
    schema: z.ZodType<T>,
    init: { body?: unknown; signal?: AbortSignal | undefined } = {},
  ): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    let response: Response;
    try {
      response = await fetch(`${base}${path}`, {
        method: init.body === undefined ? 'GET' : 'POST',
        credentials: 'include',
        headers: init.body === undefined ? {} : { 'content-type': 'application/json' },
        signal,
        ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
      });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      const isTimeout = error instanceof Error && error.name === 'TimeoutError';
      throw new ApiError({
        status: 0,
        code: isTimeout ? 'TIMEOUT' : 'NETWORK_ERROR',
        title: isTimeout ? 'Timeout' : 'Network error',
        detail: isTimeout
          ? `No response within ${timeoutMs} ms.`
          : 'The server could not be reached.',
        cause: error,
      });
    }
    const payload: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const problem = authErrorSchema.safeParse(payload);
      throw new ApiError({
        status: response.status,
        code: (problem.success && problem.data.code) || 'HTTP_ERROR',
        title: response.statusText || 'HTTP error',
        detail: problem.success
          ? problem.data.message
          : `The server answered with status ${response.status}.`,
      });
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new ApiError({
        status: response.status,
        code: 'INVALID_RESPONSE',
        title: 'Invalid response',
        detail: 'The response does not match the expected schema.',
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  return {
    getSession: (signal) => call('/get-session', authSessionSchema, { signal }),
    signIn: async (input) => {
      await call('/sign-in/email', ignored, { body: input });
    },
    signUp: async (input, callbackURL) => {
      await call('/sign-up/email', ignored, { body: { ...input, callbackURL } });
    },
    signOut: async () => {
      await call('/sign-out', ignored, { body: {} });
    },
    sendVerificationEmail: async (email, callbackURL) => {
      await call('/send-verification-email', ignored, { body: { email, callbackURL } });
    },
    requestPasswordReset: async (email, redirectTo) => {
      await call('/request-password-reset', ignored, { body: { email, redirectTo } });
    },
    resetPassword: async (password, token) => {
      await call('/reset-password', ignored, { body: { newPassword: password, token } });
    },
    listOrganizations: (signal) =>
      call('/organization/list', z.array(organizationSchema), { signal }),
    createOrganization: ({ name }) =>
      call('/organization/create', organizationSchema, { body: { name, slug: slugFor(name) } }),
    setActiveOrganization: async (organizationId) => {
      await call('/organization/set-active', ignored, { body: { organizationId } });
    },
    getInvitation: (invitationId, signal) =>
      call(
        `/organization/get-invitation?id=${encodeURIComponent(invitationId)}`,
        invitationSchema,
        {
          signal,
        },
      ),
    acceptInvitation: async (invitationId) => {
      await call('/organization/accept-invitation', ignored, { body: { invitationId } });
    },
    getAccessToken: async () => {
      try {
        return (await call('/token', accessTokenSchema)).token;
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return undefined;
        throw error;
      }
    },
  };
}

/** Le slug doit être unique : nom simplifié et suffixe aléatoire (« ma-boutique-k3x9q2 »). */
function slugFor(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = crypto.randomUUID().slice(0, 6);
  return base ? `${base}-${suffix}` : suffix;
}
