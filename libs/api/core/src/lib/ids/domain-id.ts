import { randomBytes } from 'node:crypto';
import {
  assertDomainIdPrefix,
  DOMAIN_ID_ALPHABET,
  DOMAIN_ID_SUFFIX_LENGTH,
} from '@nx-react-nestjs/contracts';

/** 9 caractères × 5 bits = 45 bits de millisecondes : suffisant jusqu'en 3084. */
const TIME_LENGTH = 9;
/** 11 caractères × 5 bits = 55 bits d'aléa par milliseconde. */
const RANDOM_LENGTH = DOMAIN_ID_SUFFIX_LENGTH - TIME_LENGTH;

/**
 * Renvoie un générateur d'IDs `<PRÉFIXE>-<horodatage><aléa>` (format : `domainIdSchema`).
 * L'horodatage en tête garde les insertions groupées en fin d'index B-tree, comme UUID v7 ou ULID.
 * Le préfixe est vérifié une fois, à la déclaration : `const newOrderId = domainIdGenerator('ORD')`.
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
  return Array.from(randomBytes(RANDOM_LENGTH), (byte) => DOMAIN_ID_ALPHABET[byte & 31]).join('');
}
