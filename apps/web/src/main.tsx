import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { i18n } from '@lingui/core';
import { I18nProvider } from '@lingui/react';
import { t } from '@lingui/core/macro';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { toast } from 'sonner';
import { createQueryClient } from '@nx-react-nestjs/web-data-access';

import { api, session } from './api';
import { activateInitialLocale } from './i18n/i18n';
import { readStoredLocale, resolveLocale } from './i18n/locale';
import { createAppRouter } from './router';

const queryClient = createQueryClient({
  onMutationError: () => toast.error(t`Une erreur est survenue.`),
});
const router = createAppRouter({ queryClient, api, session });

await activateInitialLocale(resolveLocale(readStoredLocale(), navigator.languages));

const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

root.render(
  <StrictMode>
    <I18nProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </I18nProvider>
  </StrictMode>,
);
