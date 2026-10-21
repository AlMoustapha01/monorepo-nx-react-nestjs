import { setupServer } from 'msw/node';
import { createAuthClient } from '@nx-react-nestjs/web-data-access';

export const AUTH = 'http://auth.test/api/auth';
export const auth = createAuthClient({ baseUrl: 'http://auth.test' });
export const server = setupServer();

export const betterAuthError = (status: number, code: string) =>
  Response.json({ code, message: code }, { status });

export const session = {
  user: { id: 'u1', name: 'Ada', email: 'ada@shop.test', emailVerified: true },
  session: { activeOrganizationId: 'o1' },
};
