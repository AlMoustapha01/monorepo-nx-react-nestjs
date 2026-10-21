import type { ReactNode } from 'react';
import { Trans } from '@lingui/react/macro';
import { ErrorBoundary } from 'react-error-boundary';

import { reportError } from '../report-error';

export function ErrorZone({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={
        fallback ?? (
          <p role="alert">
            <Trans>Une erreur est survenue.</Trans>
          </p>
        )
      }
      onError={(error, info) =>
        reportError(error, { componentStack: info.componentStack ?? undefined })
      }
    >
      {children}
    </ErrorBoundary>
  );
}
