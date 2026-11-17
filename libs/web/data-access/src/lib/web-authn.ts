import {
  WebAuthnAbortService,
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';

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

type RegistrationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];
type AuthenticationOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export const browserWebAuthn: WebAuthn = {
  supported: () => browserSupportsWebAuthn(),
  autofillSupported: () => browserSupportsWebAuthnAutofill(),
  register: (options) => startRegistration({ optionsJSON: options as RegistrationOptions }),
  authenticate: (options, autofill = false) =>
    startAuthentication({
      optionsJSON: options as AuthenticationOptions,
      useBrowserAutofill: autofill,
    }),
  cancel: () => WebAuthnAbortService.cancelCeremony(),
};
