import { useLingui } from '@lingui/react/macro';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { toast } from 'sonner';
import { z } from 'zod';
import { ResetPasswordPage } from '@nx-react-nestjs/web-auth';

function ResetPassword() {
  const { t } = useLingui();
  const { session } = Route.useRouteContext();
  const { token, error } = Route.useSearch();
  const navigate = useNavigate();
  return (
    <ResetPasswordPage
      auth={session.auth}
      // Le service redirige ici avec `?token=`, ou `?error=INVALID_TOKEN` si le lien a expiré.
      token={error ? undefined : token}
      onReset={async () => {
        toast.success(t`Mot de passe modifié. Connectez-vous avec le nouveau.`);
        await navigate({ to: '/connexion' });
      }}
    />
  );
}

export const Route = createFileRoute('/reinitialiser-mot-de-passe')({
  validateSearch: z.object({ token: z.string().optional(), error: z.string().optional() }),
  component: ResetPassword,
});
