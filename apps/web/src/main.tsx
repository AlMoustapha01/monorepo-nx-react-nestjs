import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { toast } from 'sonner';
import { createQueryClient } from '@nx-react-nestjs/web-data-access';

import { api } from './api';
import { createAppRouter } from './router';

const queryClient = createQueryClient({
  onMutationError: () => toast.error('Une erreur est survenue.'),
});
const router = createAppRouter(queryClient, api);

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
