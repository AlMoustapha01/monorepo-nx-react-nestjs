import { setupServer } from 'msw/node';
import { createAuthClient } from '@nx-react-nestjs/web-data-access';

export const AUTH = 'http://auth.test/api/auth';
export const auth = createAuthClient({ baseUrl: 'http://auth.test' });
export const server = setupServer();

export const betterAuthError = (status: number, code: string) =>
  Response.json({ code, message: code }, { status });

export const session = {
  user: { id: 'u1', name: 'Ada', email: 'ada@shop.test', emailVerified: true },
  session: { activeOrganizationId: 'o1' },
};

/** Navigateur simulé pour les passkeys (jsdom n'a pas WebAuthn) : il note chaque cérémonie. */
export function fakeWebAuthn({
  autofill = false,
  outcome = 'ok',
}: { autofill?: boolean; outcome?: 'ok' | 'cancelled' } = {}) {
  const ceremonies: { kind: 'register' | 'authenticate'; autofill?: boolean }[] = [];
  let cancelPending: (() => void) | undefined;
  const answer = (kind: 'register' | 'authenticate', withAutofill?: boolean) => {
    ceremonies.push({ kind, ...(withAutofill && { autofill: true }) });
    if (outcome === 'cancelled') {
      return Promise.reject(new DOMException('The user cancelled', 'NotAllowedError'));
    }
    if (withAutofill) {
      // Comme le navigateur : l'autofill attend que l'utilisateur choisisse une passkey.
      return new Promise<unknown>((resolve, reject) => {
        cancelPending = () => reject(new DOMException('Cancelled', 'AbortError'));
        choose = () => resolve({ id: 'credential' });
      });
    }
    return Promise.resolve({ id: 'credential' });
  };
  let choose: () => void = () => undefined;
  const client = createAuthClient({
    baseUrl: 'http://auth.test',
    webAuthn: {
      supported: () => true,
      autofillSupported: async () => autofill,
      register: () => answer('register'),
      authenticate: (_options, withAutofill) => answer('authenticate', withAutofill),
      cancel: () => cancelPending?.(),
    },
  });
  return { auth: client, ceremonies, choosePasskey: () => choose() };
}
