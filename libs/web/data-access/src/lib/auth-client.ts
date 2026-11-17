import {
  accessTokenSchema,
  authErrorSchema,
  authSessionSchema,
  invitationSchema,
  organizationSchema,
  type AuthSession,
  type Passkey,
  passkeySchema,
  type CreateOrganizationInput,
  type FoundAccount,
  foundAccountSchema,
  type Invitation,
  type Organization,
  type OrganizationMember,
  organizationMembersSchema,
  signInResultSchema,
  type TwoFactorSetup,
  twoFactorSetupSchema,
  type SignInInput,
  type SignUpInput,
} from '@nx-react-nestjs/contracts';
import { z } from 'zod';
import { ApiError } from './api-error';
import { browserWebAuthn, type WebAuthn } from './web-authn';

export interface AuthClientOptions {
  /** URL du service d'identité, sans `/api/auth` (ex. `http://localhost:3100`). */
  baseUrl: string;
  /** Délai maximal d'une requête, 10 000 ms par défaut. */
  timeoutMs?: number;
  /** Cérémonies des passkeys ; celles du navigateur par défaut. */
  webAuthn?: WebAuthn;
}

/**
 * Client du service d'identité (apps/auth, Better Auth). La session est un cookie du service
 * (`credentials: 'include'`) ; l'API, elle, reçoit un access token court (`getAccessToken`).
 * Erreurs : `ApiError`, avec le `code` de Better Auth (`INVALID_EMAIL_OR_PASSWORD`,
 * `EMAIL_NOT_VERIFIED`…) ou TIMEOUT / NETWORK_ERROR / HTTP_ERROR.
 */
export interface AuthClient {
  getSession(signal?: AbortSignal): Promise<AuthSession>;
  /** `twoFactorRequired` : le mot de passe est bon, il faut encore le second facteur (`verifySecondFactor`). */
  signIn(input: SignInInput): Promise<{ twoFactorRequired: boolean }>;
  /** Code de l'application d'authentification, ou un code de secours (`backupCode`). */
  verifySecondFactor(code: string, options?: { backupCode?: boolean }): Promise<void>;
  /** Commence l'activation : la 2FA n'est active qu'après un premier code (`confirmTwoFactor`). */
  enableTwoFactor(password: string): Promise<TwoFactorSetup>;
  /** Le navigateur sait utiliser une passkey. */
  passkeysSupported(): boolean;
  passkeyAutofillSupported(): Promise<boolean>;
  /**
   * Connexion par passkey. `autofill` : la passkey se choisit dans les suggestions du champ email ; la promesse
   * attend ce choix. Annulée ou abandonnée : `ApiError` de code `PASSKEY_CANCELLED`.
   */
  signInWithPasskey(options?: { autofill?: boolean }): Promise<void>;
  /** Abandonne une connexion par passkey en attente (autofill), quand la page la quitte. */
  cancelPasskey(): void;
  registerPasskey(name?: string): Promise<void>;
  listPasskeys(signal?: AbortSignal): Promise<Passkey[]>;
  deletePasskey(id: string): Promise<void>;
  confirmTwoFactor(code: string): Promise<void>;
  disableTwoFactor(password: string): Promise<void>;
  /** Nouveaux codes de secours ; les anciens ne valent plus. */
  regenerateBackupCodes(password: string): Promise<string[]>;
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
  /** Membres de l'organisation active (500 au plus), pour afficher un nom à la place d'un ID. */
  listMembers(signal?: AbortSignal): Promise<OrganizationMember[]>;
  getInvitation(invitationId: string, signal?: AbortSignal): Promise<Invitation>;
  acceptInvitation(invitationId: string): Promise<void>;
  /** Rôle Better Auth (`owner`, `admin`, `member`) dans l'organisation active. */
  getActiveMemberRole(signal?: AbortSignal): Promise<string>;
  /** L'organisation exige la 2FA de ses membres, ou plus. Réservé à un `owner` ou un `admin` qui a la 2FA. */
  setTwoFactorRequirement(organizationId: string, required: boolean): Promise<void>;
  /** Access token de 15 min pour l'API ; `undefined` sans session. */
  getAccessToken(): Promise<string | undefined>;
  /** Back-office (opérateurs) : comptes dont l'email, le nom ou une organisation contient `query`. */
  searchAccounts(query: string, signal?: AbortSignal): Promise<FoundAccount[]>;
  /** Ouvre une session au nom de l'utilisateur, une heure au plus ; exige la 2FA de l'opérateur. */
  impersonate(userId: string): Promise<void>;
  /** Revient à la session de l'opérateur. */
  stopImpersonating(): Promise<void>;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const ignored = z.unknown();
const backupCodesSchema = z.object({ backupCodes: z.array(z.string()) });
const memberRoleSchema = z.object({ role: z.string() });

export function createAuthClient(options: AuthClientOptions): AuthClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const base = `${options.baseUrl.replace(/\/+$/, '')}/api/auth`;
  const webAuthn = options.webAuthn ?? browserWebAuthn;

  /** Cérémonie du navigateur ; un refus de l'utilisateur ou une cérémonie remplacée n'est pas une panne. */
  async function ceremony(run: () => Promise<unknown>): Promise<unknown> {
    try {
      return await run();
    } catch (error) {
      // DOMException n'hérite pas d'Error partout : on lit son nom.
      const name =
        typeof error === 'object' && error !== null && 'name' in error ? String(error.name) : '';
      const cancelled = name === 'NotAllowedError' || name === 'AbortError';
      throw new ApiError({
        status: 0,
        code: cancelled ? 'PASSKEY_CANCELLED' : 'PASSKEY_FAILED',
        title: cancelled ? 'Passkey cancelled' : 'Passkey failed',
        detail:
          typeof error === 'object' && error !== null && 'message' in error
            ? String(error.message)
            : 'The browser refused the passkey.',
        cause: error,
      });
    }
  }

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
      const result = await call('/sign-in/email', signInResultSchema, { body: input });
      return { twoFactorRequired: result.twoFactorRedirect === true };
    },
    verifySecondFactor: async (code, { backupCode = false } = {}) => {
      const path = backupCode ? '/two-factor/verify-backup-code' : '/two-factor/verify-totp';
      await call(path, ignored, { body: { code } });
    },
    passkeysSupported: () => webAuthn.supported(),
    passkeyAutofillSupported: () => webAuthn.autofillSupported(),
    signInWithPasskey: async ({ autofill } = {}) => {
      const challenge = await call('/passkey/generate-authenticate-options', z.unknown());
      const response = await ceremony(() => webAuthn.authenticate(challenge, autofill));
      await call('/passkey/verify-authentication', ignored, { body: { response } });
    },
    cancelPasskey: () => webAuthn.cancel(),
    registerPasskey: async (name) => {
      const challenge = await call('/passkey/generate-register-options', z.unknown());
      const response = await ceremony(() => webAuthn.register(challenge));
      await call('/passkey/verify-registration', ignored, {
        body: { response, ...(name && { name }) },
      });
    },
    listPasskeys: (signal) =>
      call('/passkey/list-user-passkeys', z.array(passkeySchema), { signal }),
    deletePasskey: async (id) => {
      await call('/passkey/delete-passkey', ignored, { body: { id } });
    },
    enableTwoFactor: (password) =>
      call('/two-factor/enable', twoFactorSetupSchema, { body: { password } }),
    confirmTwoFactor: async (code) => {
      await call('/two-factor/verify-totp', ignored, { body: { code } });
    },
    disableTwoFactor: async (password) => {
      await call('/two-factor/disable', ignored, { body: { password } });
    },
    regenerateBackupCodes: async (password) =>
      (await call('/two-factor/generate-backup-codes', backupCodesSchema, { body: { password } }))
        .backupCodes,
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
    listMembers: (signal) =>
      call('/organization/list-members?limit=500', organizationMembersSchema, { signal }),
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
    getActiveMemberRole: async (signal) =>
      (await call('/organization/get-active-member-role', memberRoleSchema, { signal })).role,
    setTwoFactorRequirement: async (organizationId, required) => {
      await call('/organization/update', ignored, {
        body: { organizationId, data: { requireTwoFactor: required } },
      });
    },
    searchAccounts: async (query, signal) =>
      (
        await call(
          `/operator/search?query=${encodeURIComponent(query)}`,
          z.object({ users: z.array(foundAccountSchema) }),
          { signal },
        )
      ).users,
    impersonate: async (userId) => {
      await call('/admin/impersonate-user', ignored, { body: { userId } });
    },
    stopImpersonating: async () => {
      await call('/admin/stop-impersonating', ignored, { body: {} });
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
