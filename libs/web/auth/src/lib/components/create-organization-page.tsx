import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { createOrganizationSchema, type CreateOrganizationInput } from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, FormError, FormField, Stack } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { AuthCard } from './auth-card';

interface CreateOrganizationPageProps {
  auth: AuthClient;
  /** L'organisation créée est déjà l'organisation active de la session. */
  onCreated: () => Promise<void> | void;
}

/** Première étape après l'inscription : sans organisation, pas de tenant, donc pas d'API. */
export function CreateOrganizationPage({ auth, onCreated }: CreateOrganizationPageProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const form = useForm<CreateOrganizationInput>({
    resolver: zodResolver(createOrganizationSchema),
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    try {
      await auth.createOrganization(input);
      await onCreated();
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });

  return (
    <AuthCard
      title={<Trans>Créer votre organisation</Trans>}
      description={
        <Trans>
          Votre organisation regroupe vos données et vos collègues. Vous pourrez inviter d'autres
          personnes ensuite.
        </Trans>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <Stack gap={4}>
          <FormField
            label={t`Nom de l'organisation`}
            autoComplete="organization"
            error={errors.name && t`Saisissez un nom.`}
            {...form.register('name')}
          />
          <FormError message={errors.root?.message} />
          <Button type="submit" disabled={isSubmitting}>
            <Trans>Créer</Trans>
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
