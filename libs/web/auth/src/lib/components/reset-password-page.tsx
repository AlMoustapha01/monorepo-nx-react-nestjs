import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  resetPasswordSchema,
  type ResetPasswordInput,
} from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, Stack, Text } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { AuthCard } from './auth-card';
import { FormError } from './form-error';
import { FormField } from './form-field';

interface ResetPasswordPageProps {
  auth: AuthClient;
  /** Absent : lien invalide ou expiré (le service redirige avec `?error=INVALID_TOKEN`). */
  token: string | undefined;
  onReset: () => Promise<void> | void;
}

export function ResetPasswordPage({ auth, token, onReset }: ResetPasswordPageProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const form = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ password }) => {
    if (!token) return;
    try {
      await auth.resetPassword(password, token);
      await onReset();
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });

  return (
    <AuthCard title={<Trans>Nouveau mot de passe</Trans>}>
      {token ? (
        <form noValidate onSubmit={(event) => void submit(event)}>
          <Stack gap={4}>
            <FormField
              label={t`Nouveau mot de passe`}
              type="password"
              autoComplete="new-password"
              error={
                errors.password &&
                t`Entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères.`
              }
              {...form.register('password')}
            />
            <FormError message={errors.root?.message} />
            <Button type="submit" disabled={isSubmitting}>
              <Trans>Enregistrer</Trans>
            </Button>
          </Stack>
        </form>
      ) : (
        <Stack gap={4}>
          <Text role="alert">
            <Trans>Ce lien n'est plus valide. Demandez-en un nouveau.</Trans>
          </Text>
          <Link to="/mot-de-passe-oublie">
            <Trans>Recevoir un nouveau lien</Trans>
          </Link>
        </Stack>
      )}
    </AuthCard>
  );
}
