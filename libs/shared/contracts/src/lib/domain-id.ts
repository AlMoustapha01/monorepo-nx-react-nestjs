import { z } from 'zod';

/**
 * Format des identifiants métier : `<PRÉFIXE>-<suffixe>`, par exemple `ORD-01jb4x7k2m9qwfzp3hd8`.
 * Le préfixe dit de quoi il s'agit (logs, support, URL). Le suffixe commence par l'horodatage,
 * donc les IDs se trient par date de création (cf. `domainIdGenerator` dans api-core).
 * Alphabet base32 en minuscules sans i, l, o, u, dans l'ordre ASCII : pas de confusion à la
 * lecture, et l'ordre des caractères est celui des valeurs.
 */
export const DOMAIN_ID_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const DOMAIN_ID_SUFFIX_LENGTH = 20;

const PREFIX_PATTERN = /^[A-Z]{2,5}$/;

/** Appelée à la déclaration des IDs, donc au démarrage : une erreur de préfixe est un bug de code. */
export function assertDomainIdPrefix(prefix: string): void {
  if (!PREFIX_PATTERN.test(prefix)) {
    throw new Error(`Invalid domain id prefix "${prefix}": expected 2 to 5 uppercase letters`);
  }
}

/** Valide un ID d'un type donné : un `ORD-…` est refusé là où un `PRD-…` est attendu. */
export function domainIdSchema(prefix: string) {
  assertDomainIdPrefix(prefix);
  const pattern = new RegExp(`^${prefix}-[${DOMAIN_ID_ALPHABET}]{${DOMAIN_ID_SUFFIX_LENGTH}}$`);
  return z.string().regex(pattern, `Expected a ${prefix}-… identifier`);
}
