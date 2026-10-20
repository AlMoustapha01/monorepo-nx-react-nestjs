import { CoreError } from '../errors/app-error';
import { decodeCursor, encodeCursor } from './cursor';

describe('cursor', () => {
  it('fait un aller-retour sans perte', () => {
    const cursor = {
      createdAt: new Date('2026-10-20T08:30:00.123Z'),
      id: '0199f5c2-6a1e-7b3c-9d4e-5f6a7b8c9d0e',
    };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each(['not-base64', Buffer.from('["2026-10-20", 42]').toString('base64url')])(
    'rejette un curseur forgé (%s)',
    (raw) => {
      expect(() => decodeCursor(raw)).toThrow(CoreError);
    },
  );
});
