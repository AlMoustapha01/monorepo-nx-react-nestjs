import { createApiClient } from '@nx-react-nestjs/web-data-access';

export const api = createApiClient({
  baseUrl: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1',
  getToken: () => import.meta.env.VITE_DEV_TOKEN,
});
