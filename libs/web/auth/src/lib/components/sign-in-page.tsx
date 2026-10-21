import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { Link } from '@tanstack/react-router';
import { signInSchema, type SignInInput } from '@nx-react-nestjs/contracts';
import { ApiError, type AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, Stack, Text, buttonVariants } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { AuthCard } from './auth-card';
import { FormError } from './form-error';
import { FormField } from './form-field';

interface SignInPageProps {
  auth: AuthClient;
  /** Page ouverte par le lien de vérification, si l'email doit être confirmé à nouveau. */
  verificationCallbackUrl: string;
  onSignedIn: () => Promise<void> | void;
  /** Page à rouvrir après connexion, conservée par le lien « Créer un compte ». */
  redirect?: string | undefined;
}

export function SignInPage({
  auth,
  verificationCallbackUrl,
  onSignedIn,
  redirect,
}: SignInPageProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const [unverifiedEmail, setUnverifiedEmail] = useState<string>();
  const [verificationSent, setVerificationSent] = useState(false);
  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (input) => {
    setVerificationSent(false);
    try {
      await auth.signIn(input);
      await onSignedIn();
    } catch (error) {
      setUnverifiedEmail(
        error instanceof ApiError && error.code === 'EMAIL_NOT_VERIFIED' ? input.email : undefined,
      );
      form.setError('root', { message: errorMessage(error) });
    }
  });

  const resendVerification = async () => {
    if (!unverifiedEmail) return;
    try {
      await auth.sendVerificationEmail(unverifiedEmail, verificationCallbackUrl);
      setVerificationSent(true);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  };

  return (
    <AuthCard
      title={<Trans>Connexion</Trans>}
      footer={
        <Text size="sm" tone="muted">
          <Trans>
            Pas encore de compte ?{' '}
            <Link to="/inscription" search={redirect ? { redirect } : {}}>
              Créer un compte
            </Link>
          </Trans>
        </Text>
      }
    >
      <form noValidate onSubmit={(event) => void submit(event)}>
        <Stack gap={4}>
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
            autoComplete="current-password"
            error={errors.password && t`Saisissez votre mot de passe.`}
            {...form.register('password')}
          />
          <FormError message={errors.root?.message} />
          {unverifiedEmail &&
            (verificationSent ? (
              <Text size="sm" aria-live="polite">
                <Trans>Un nouveau lien de confirmation a été envoyé.</Trans>
              </Text>
            ) : (
              <Button type="button" variant="outline" onClick={() => void resendVerification()}>
                <Trans>Renvoyer le lien de confirmation</Trans>
              </Button>
            ))}
          <Button type="submit" disabled={isSubmitting}>
            <Trans>Se connecter</Trans>
          </Button>
          <Link to="/mot-de-passe-oublie" className={buttonVariants({ variant: 'link' })}>
            <Trans>Mot de passe oublié ?</Trans>
          </Link>
        </Stack>
      </form>
    </AuthCard>
  );
}
