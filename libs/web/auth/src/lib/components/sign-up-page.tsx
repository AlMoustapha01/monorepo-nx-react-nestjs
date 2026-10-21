import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  signUpSchema,
  type SignUpInput,
} from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, Stack, Text } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { AuthCard } from './auth-card';
import { FormError } from './form-error';
import { FormField } from './form-field';

interface SignUpPageProps {
  auth: AuthClient;
  /** Page ouverte après le clic sur le lien de confirmation (session ouverte). */
  verificationCallbackUrl: string;
  /** Conservée par le lien « Se connecter ». */
  redirect?: string | undefined;
}

export function SignUpPage({ auth, verificationCallbackUrl, redirect }: SignUpPageProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const [sentTo, setSentTo] = useState<string>();
  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    try {
      await auth.signUp(input, verificationCallbackUrl);
      setSentTo(input.email);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });

  if (sentTo) {
    return (
      <AuthCard title={<Trans>Vérifiez votre boîte mail</Trans>}>
        <Text aria-live="polite">
          <Trans>
            Nous avons envoyé un lien de confirmation à {sentTo}. Ouvrez-le pour activer votre
            compte.
          </Trans>
        </Text>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={<Trans>Créer un compte</Trans>}
      footer={
        <Text size="sm" tone="muted">
          <Trans>
            Déjà un compte ?{' '}
            <Link to="/connexion" search={redirect ? { redirect } : {}}>
              Se connecter
            </Link>
          </Trans>
        </Text>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <Stack gap={4}>
          <FormField
            label={t`Nom`}
            autoComplete="name"
            error={errors.name && t`Saisissez votre nom.`}
            {...form.register('name')}
          />
          <FormField
            label={t`Adresse email`}
            type="email"
            autoComplete="email"
            error={errors.email && t`Saisissez une adresse email valide.`}
            {...form.register('email')}
          />
          <FormField
            label={t`Mot de passe`}
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
            <Trans>Créer mon compte</Trans>
          </Button>
        </Stack>
      </form>
    </AuthCard>
  );
}
