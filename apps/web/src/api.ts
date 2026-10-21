import {
  createAccessTokenSource,
  createApiClient,
  createAuthClient,
} from '@nx-react-nestjs/web-data-access';

import type { SessionContext } from './session';

// Le token de dev ne doit jamais atteindre un build de production. Défini : pas de connexion,
// l'app appelle l'API avec ce token (sans service d'auth). Absent : session du service d'auth.
const devToken = import.meta.env.DEV ? import.meta.env.VITE_DEV_TOKEN : undefined;

const auth = createAuthClient({
  baseUrl: import.meta.env.VITE_AUTH_URL ?? 'http://localhost:3100',
});
const tokens = createAccessTokenSource(() => auth.getAccessToken());

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  getToken: devToken ? () => devToken : tokens.getToken,
});

export const session: SessionContext = { auth, tokens, devMode: devToken !== undefined };
