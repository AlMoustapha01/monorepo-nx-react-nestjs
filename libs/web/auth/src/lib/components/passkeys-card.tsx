import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { passkeyNameSchema } from '@nx-react-nestjs/contracts';
import { ApiError, type AuthClient } from '@nx-react-nestjs/web-data-access';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
  FormField,
  Heading,
  Stack,
  Text,
} from '@nx-react-nestjs/web-ui';

import { passkeysKey } from '../data/two-factor';
import { useAuthErrorMessage } from '../hooks/use-auth-error-message';

/** Passkeys du compte : connexion sans mot de passe, par l'empreinte, le visage ou le code de l'appareil. */
export function PasskeysCard({ auth }: { auth: AuthClient }) {
  const { t, i18n } = useLingui();
  const queryClient = useQueryClient();
  const errorMessage = useAuthErrorMessage();
  const passkeys = useQuery({
    queryKey: passkeysKey,
    queryFn: ({ signal }) => auth.listPasskeys(signal),
  });
  const [deleting, setDeleting] = useState<string>();
  const [deleteError, setDeleteError] = useState<string>();
  const form = useForm<{ name: string }>({
    resolver: zodResolver(passkeyNameSchema),
    defaultValues: { name: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const add = form.handleSubmit(async ({ name }) => {
    try {
      await auth.registerPasskey(name || undefined);
      form.reset();
      await queryClient.invalidateQueries({ queryKey: passkeysKey });
    } catch (error) {
      // Fenêtre fermée par l'utilisateur : rien à signaler.
      if (error instanceof ApiError && error.code === 'PASSKEY_CANCELLED') return;
      form.setError('root', { message: errorMessage(error) });
    }
  });

  const remove = async (id: string) => {
    setDeleting(id);
    setDeleteError(undefined);
    try {
      await auth.deletePasskey(id);
      await queryClient.invalidateQueries({ queryKey: passkeysKey });
    } catch (error) {
      setDeleteError(errorMessage(error));
    } finally {
      setDeleting(undefined);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <Heading level={2} className="text-base">
            <Trans>Passkeys</Trans>
          </Heading>
        </CardTitle>
        <CardDescription>
          <Trans>
            Connectez-vous sans mot de passe, avec l’empreinte, le visage ou le code de votre
            appareil. Une passkey vaut aussi la vérification en deux étapes.
          </Trans>
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Stack gap={4}>
          {passkeys.data && passkeys.data.length > 0 && (
            <ul aria-label={t`Passkeys`} className="divide-y rounded-md border">
              {passkeys.data.map((passkey) => {
                const name = passkey.name || t`Passkey sans nom`;
                return (
                  <li key={passkey.id} className="flex items-center justify-between gap-3 p-3">
                    <Stack gap={1}>
                      <Text>{name}</Text>
                      <Text size="sm" tone="muted">
                        <Trans>
                          Ajoutée le {i18n.date(passkey.createdAt, { dateStyle: 'long' })}
                        </Trans>
                      </Text>
                    </Stack>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={deleting === passkey.id}
                      aria-label={t`Supprimer la passkey ${name}`}
                      onClick={() => void remove(passkey.id)}
                    >
                      <Trans>Supprimer</Trans>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          <FormError message={deleteError} />
          {auth.passkeysSupported() ? (
            <form noValidate onSubmit={(event) => void add(event)}>
              <Stack gap={3}>
                <FormField
                  label={t`Nom de la passkey (facultatif)`}
                  autoComplete="off"
                  error={errors.name && t`64 caractères au plus.`}
                  {...form.register('name')}
                />
                <FormError message={errors.root?.message} />
                <Button type="submit" disabled={isSubmitting}>
                  <Trans>Ajouter une passkey</Trans>
                </Button>
              </Stack>
            </form>
          ) : (
            <Text tone="muted">
              <Trans>Ce navigateur ne sait pas utiliser les passkeys.</Trans>
            </Text>
          )}
        </Stack>
      </CardContent>
    </Card>
  );
}
