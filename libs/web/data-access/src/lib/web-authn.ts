/**
 * Cérémonies WebAuthn du navigateur (passkeys). Les options viennent du service d'identité, la réponse lui
 * retourne telle quelle : le client ne les lit pas. Injectable, pour les tests (jsdom n'a pas WebAuthn).
 */
export interface WebAuthn {
  supported(): boolean;
  /** Passkeys proposées dans les suggestions du champ email (« conditional UI »). */
  autofillSupported(): Promise<boolean>;
  register(options: unknown): Promise<unknown>;
  authenticate(options: unknown, autofill?: boolean): Promise<unknown>;
  /** Abandonne la cérémonie en cours (l'autofill attend sans fin un choix). */
  cancel(): void;
}

type SimpleWebAuthn = typeof import('@simplewebauthn/browser');
type RegistrationOptions = Parameters<SimpleWebAuthn['startRegistration']>[0]['optionsJSON'];
type AuthenticationOptions = Parameters<SimpleWebAuthn['startAuthentication']>[0]['optionsJSON'];

// Chargée à la première cérémonie : la page de connexion, présente pour tous, n'en paie pas le poids.
let library: SimpleWebAuthn | undefined;
const load = async () => (library ??= await import('@simplewebauthn/browser'));

const publicKeyCredential = () =>
  typeof window === 'undefined' ? undefined : window.PublicKeyCredential;

export const browserWebAuthn: WebAuthn = {
  supported: () => typeof publicKeyCredential() === 'function',
  autofillSupported: async () =>
    (await publicKeyCredential()?.isConditionalMediationAvailable?.()) === true,
  register: async (options) =>
    (await load()).startRegistration({ optionsJSON: options as RegistrationOptions }),
  authenticate: async (options, autofill = false) =>
    (await load()).startAuthentication({
      optionsJSON: options as AuthenticationOptions,
      useBrowserAutofill: autofill,
    }),
  // Aucune cérémonie n'a pu commencer avant le chargement de la bibliothèque.
  cancel: () => library?.WebAuthnAbortService.cancelCeremony(),
};
