import { createApiClient } from '@nx-react-nestjs/web-data-access';

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  // Le token de dev ne doit jamais atteindre un build de production.
  getToken: () => (import.meta.env.DEV ? import.meta.env.VITE_DEV_TOKEN : undefined),
});
