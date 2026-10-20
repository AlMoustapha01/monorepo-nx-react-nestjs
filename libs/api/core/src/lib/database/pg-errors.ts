const UNIQUE_VIOLATION = '23505';

interface PgError {
  code: string;
  constraint?: string;
}

/** Drizzle enveloppe les erreurs du driver : on remonte la chaîne `cause` jusqu'à l'erreur Postgres. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pgError = findPgError(error);
  return pgError?.code === UNIQUE_VIOLATION && pgError.constraint === constraint;
}

function findPgError(error: unknown): PgError | undefined {
  for (let current = error; current instanceof Error; current = current.cause) {
    if ('code' in current && typeof current.code === 'string') {
      return current as Error & PgError;
    }
  }
  return undefined;
}
