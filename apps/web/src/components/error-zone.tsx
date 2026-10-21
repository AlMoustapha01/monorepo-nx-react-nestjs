import type { ReactNode } from 'react';
import { ErrorBoundary } from 'react-error-boundary';

import { reportError } from '../report-error';

export function ErrorZone({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  return (
    <ErrorBoundary
      fallback={fallback ?? <p role="alert">Une erreur est survenue.</p>}
      onError={(error, info) =>
        reportError(error, { componentStack: info.componentStack ?? undefined })
      }
    >
      {children}
    </ErrorBoundary>
  );
}
