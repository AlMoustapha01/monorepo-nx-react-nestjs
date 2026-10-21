import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { CoreError } from '../errors/app-error';

/**
 * Verrou optimiste côté client (RFC 9110) : chaque réponse porte `ETag: "<version>"`,
 * et une modification peut renvoyer `If-Match: "<version>"` pour ne pas écraser
 * le travail de quelqu'un d'autre.
 */
export const etagFor = (version: number): string => `"${version}"`;

const ETAG_PATTERN = /^(?:W\/)?"(\d+)"$/;

/** Version attendue lue dans `If-Match` ; `undefined` si l'en-tête est absent ou vaut `*`. */
export function parseIfMatch(header: string | undefined): number | undefined {
  if (header === undefined || header.trim() === '*') {
    return undefined;
  }
  const match = ETAG_PATTERN.exec(header.trim());
  if (!match) {
    throw new CoreError('INVALID_IF_MATCH', 'If-Match must be a single ETag such as "3"');
  }
  return Number(match[1]);
}

export const IfMatchVersion = createParamDecorator(
  (_data: unknown, execution: ExecutionContext): number | undefined =>
    parseIfMatch(execution.switchToHttp().getRequest<Request>().header('if-match')),
);

/** 412 si le client a fourni une version et qu'elle n'est plus la version courante. */
export function assertExpectedVersion(expected: number | undefined, current: number): void {
  if (expected !== undefined && expected !== current) {
    throw new CoreError('PRECONDITION_FAILED', 'The resource was modified since you last read it', {
      expectedVersion: expected,
      currentVersion: current,
    });
  }
}
