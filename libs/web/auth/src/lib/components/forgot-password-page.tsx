import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import {
  requestPasswordResetSchema,
  type RequestPasswordResetInput,
} from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, FormError, FormField, Stack, Text } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { AuthCard } from './auth-card';

interface ForgotPasswordPageProps {
  auth: AuthClient;
  /** Page du front qui reçoit `?token=` pour choisir le nouveau mot de passe. */
  resetPasswordUrl: string;
}

export function ForgotPasswordPage({ auth, resetPasswordUrl }: ForgotPasswordPageProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const [sent, setSent] = useState(false);
  const form = useForm<RequestPasswordResetInput>({
    resolver: zodResolver(requestPasswordResetSchema),
    defaultValues: { email: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ email }) => {
    try {
      await auth.requestPasswordReset(email, resetPasswordUrl);
      setSent(true);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });

  return (
    <AuthCard
      title={<Trans>Mot de passe oublié</Trans>}
      footer={
        <Text size="sm" tone="muted">
          <Link to="/connexion">
            <Trans>Retour à la connexion</Trans>
          </Link>
        </Text>
      }
    >
      {sent ? (
        // Même réponse que le compte existe ou non : la page ne révèle pas qui est inscrit.
        <Text aria-live="polite">
          <Trans>
            Si un compte existe pour cette adresse, vous allez recevoir un lien pour choisir un
            nouveau mot de passe.
          </Trans>
        </Text>
      ) : (
        <form noValidate onSubmit={(event) => void submit(event)}>
          <Stack gap={4}>
            <FormField
              label={t`Adresse email`}
              type="email"
              autoComplete="email"
              error={errors.email && t`Saisissez une adresse email valide.`}
              {...form.register('email')}
            />
            <FormError message={errors.root?.message} />
            <Button type="submit" disabled={isSubmitting}>
              <Trans>Recevoir un lien</Trans>
            </Button>
          </Stack>
        </form>
      )}
    </AuthCard>
  );
}
