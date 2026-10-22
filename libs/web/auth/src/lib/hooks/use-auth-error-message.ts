import { useLingui } from '@lingui/react/macro';
import { ApiError } from '@nx-react-nestjs/web-data-access';

/** Message localisé pour une erreur du service d'identité ; les codes inconnus restent génériques. */
export function useAuthErrorMessage(): (error: unknown) => string {
  const { t } = useLingui();
  return (error) => {
    if (!(error instanceof ApiError)) return t`Une erreur est survenue. Réessayez.`;
    if (error.status === 429) return t`Trop de tentatives. Réessayez dans quelques instants.`;
    switch (error.code) {
      case 'INVALID_EMAIL_OR_PASSWORD':
        return t`Email ou mot de passe incorrect.`;
      case 'EMAIL_NOT_VERIFIED':
        return t`Confirmez d'abord votre adresse email : nous vous avons envoyé un lien.`;
      // Jamais renvoyé tant que la vérification d'email est obligatoire (le service ne révèle pas
      // les comptes existants) ; gardé si cette configuration change.
      case 'USER_ALREADY_EXISTS':
      case 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL':
        return t`Un compte existe déjà avec cette adresse email.`;
      case 'INVALID_TOKEN':
      case 'TOKEN_EXPIRED':
        return t`Ce lien n'est plus valide. Demandez-en un nouveau.`;
      case 'INVITATION_NOT_FOUND':
        return t`Cette invitation n'existe pas ou a expiré.`;
      case 'YOU_ARE_NOT_THE_RECIPIENT_OF_THE_INVITATION':
        return t`Cette invitation est destinée à une autre adresse email.`;
      case 'NETWORK_ERROR':
      case 'TIMEOUT':
        return t`Le service est injoignable. Vérifiez votre connexion et réessayez.`;
      default:
        return t`Une erreur est survenue. Réessayez.`;
    }
  };
}
