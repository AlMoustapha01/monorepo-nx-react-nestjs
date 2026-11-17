import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { backupCodeSchema, totpCodeSchema } from '@nx-react-nestjs/contracts';
import { ApiError, type AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, FormError, FormField, Stack, Text } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';

interface SecondFactorFormProps {
  auth: AuthClient;
  onVerified: () => Promise<void> | void;
  /** Étape expirée (10 min) : la connexion recommence au mot de passe. */
  onExpired: (message: string) => void;
}

/** Seconde étape de la connexion : code de l'application d'authentification, ou un code de secours. */
export function SecondFactorForm({ auth, onVerified, onExpired }: SecondFactorFormProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  /** Code de secours plutôt que l'application (téléphone perdu). */
  const [backup, setBackup] = useState(false);
  const form = useForm<{ code: string }>({
    resolver: zodResolver(backup ? backupCodeSchema : totpCodeSchema),
    defaultValues: { code: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    try {
      await auth.verifySecondFactor(code, { backupCode: backup });
      await onVerified();
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_TWO_FACTOR_COOKIE') {
        onExpired(errorMessage(error));
        return;
      }
      form.setError('root', { message: errorMessage(error) });
    }
  });

  const toggle = () => {
    setBackup(!backup);
    form.reset({ code: '' });
  };

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <Stack gap={4}>
        <Text tone="muted">
          {!backup ? (
            <Trans>
              Saisissez le code à 6 chiffres affiché par votre application d’authentification.
            </Trans>
          ) : (
            <Trans>Saisissez l’un des codes de secours obtenus à l’activation de la 2FA.</Trans>
          )}
        </Text>
        {!backup ? (
          <FormField
            key="totp"
            label={t`Code de l’application d’authentification`}
            inputMode="numeric"
            autoComplete="one-time-code"
            error={errors.code && t`Saisissez les 6 chiffres du code.`}
            {...form.register('code')}
          />
        ) : (
          <FormField
            key="backup-code"
            label={t`Code de secours`}
            autoComplete="off"
            error={errors.code && t`Saisissez un code de secours.`}
            {...form.register('code')}
          />
        )}
        <FormError message={errors.root?.message} />
        <Button type="submit" disabled={isSubmitting}>
          <Trans>Vérifier</Trans>
        </Button>
        <Button type="button" variant="link" onClick={toggle}>
          {!backup ? (
            <Trans>Utiliser un code de secours</Trans>
          ) : (
            <Trans>Utiliser l’application d’authentification</Trans>
          )}
        </Button>
      </Stack>
    </form>
  );
}
