import { z } from 'zod';

/**
 * Format des identifiants métier : `<PRÉFIXE>-<suffixe>`, par exemple `ORD-01jb4x7k2m9qwfzp3hd8`.
 * Le préfixe dit de quoi il s'agit (logs, support, URL). Le suffixe commence par l'horodatage,
 * donc les IDs se trient par date de création (`domainIdGenerator`).
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

/** 9 caractères × 5 bits = 45 bits de millisecondes : suffisant jusqu'en 3084. */
const TIME_LENGTH = 9;
/** 11 caractères × 5 bits = 55 bits d'aléa par milliseconde. */
const RANDOM_LENGTH = DOMAIN_ID_SUFFIX_LENGTH - TIME_LENGTH;

/**
 * Renvoie un générateur d'IDs `<PRÉFIXE>-<horodatage><aléa>` (format : `domainIdSchema`).
 * L'horodatage en tête garde les insertions groupées en fin d'index B-tree, comme UUID v7 ou ULID.
 * Le préfixe est vérifié une fois, à la déclaration : `const newOrderId = domainIdGenerator('ORD')`.
 * Web Crypto : le même générateur sert à l'API et au service d'identité (journal d'audit).
 */
export function domainIdGenerator(prefix: string, now: () => number = Date.now): () => string {
  assertDomainIdPrefix(prefix);
  return () => `${prefix}-${encodeTime(now())}${randomPart()}`;
}

function encodeTime(ms: number): string {
  let value = ms;
  let encoded = '';
  for (let i = 0; i < TIME_LENGTH; i++) {
    encoded = DOMAIN_ID_ALPHABET[value % 32] + encoded;
    value = Math.floor(value / 32);
  }
  return encoded;
}

function randomPart(): string {
  // 256 est un multiple de 32 : masquer 5 bits ne biaise pas la distribution.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(RANDOM_LENGTH));
  return Array.from(bytes, (byte) => DOMAIN_ID_ALPHABET[byte & 31]).join('');
}
