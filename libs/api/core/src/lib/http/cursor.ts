import { z } from 'zod';
import { CoreError } from '../errors/app-error';

/** Position dans une liste triée par (createdAt DESC, id DESC). */
export interface KeysetCursor {
  createdAt: Date;
  id: string;
}

const cursorSchema = z.tuple([z.iso.datetime(), z.uuid()]);

export function encodeCursor({ createdAt, id }: KeysetCursor): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString('base64url');
}

export function decodeCursor(raw: string): KeysetCursor {
  try {
    const [createdAt, id] = cursorSchema.parse(
      JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')),
    );
    return { createdAt: new Date(createdAt), id };
  } catch {
    throw new CoreError('INVALID_CURSOR', 'The pagination cursor is invalid');
  }
}
