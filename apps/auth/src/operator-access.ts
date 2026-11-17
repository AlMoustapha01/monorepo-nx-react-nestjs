import { OPERATOR_ROLE } from '@nx-react-nestjs/contracts';
import { APIError } from 'better-auth/api';

/** Session de l'appelant, telle que la donne `sessionMiddleware` (champs des plugins compris). */
interface CallerSession {
  user: object;
  session: object;
}

/**
 * Refuse (403) qui n'est pas opérateur de la plateforme ; avec `secondFactor`, aussi l'opérateur sans 2FA ni
 * session ouverte par passkey : une action qui touche le compte d'un client l'exige (ADR 0019).
 */
export function requireOperator(
  caller: CallerSession,
  { secondFactor = false }: { secondFactor?: boolean } = {},
): void {
  const user = caller.user as { role?: unknown; twoFactorEnabled?: unknown };
  const session = caller.session as { passkeySignIn?: unknown };
  if (user.role !== OPERATOR_ROLE) {
    throw new APIError('FORBIDDEN', {
      code: 'OPERATOR_REQUIRED',
      message: 'Only platform operators can do this',
    });
  }
  if (secondFactor && user.twoFactorEnabled !== true && session.passkeySignIn !== true) {
    throw new APIError('FORBIDDEN', {
      code: 'OPERATOR_TWO_FACTOR_REQUIRED',
      message: 'Enable two-factor authentication first',
    });
  }
}
