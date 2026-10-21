import { createFileRoute } from '@tanstack/react-router';
import { ForgotPasswordPage } from '@nx-react-nestjs/web-auth';

import { appUrl, RESET_PASSWORD_PATH } from '../session';

function ForgotPassword() {
  const { session } = Route.useRouteContext();
  return <ForgotPasswordPage auth={session.auth} resetPasswordUrl={appUrl(RESET_PASSWORD_PATH)} />;
}

export const Route = createFileRoute('/mot-de-passe-oublie')({ component: ForgotPassword });
