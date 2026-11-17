import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'react-qr-code';
import { confirmPasswordSchema, totpCodeSchema } from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FormError,
  FormField,
  Heading,
  Label,
  Stack,
  Text,
} from '@nx-react-nestjs/web-ui';

import { authKeys, organizationsQueryOptions, sessionQueryOptions } from '../data/queries';
import {
  activeMemberRoleKey,
  isManagerRole,
  PASSWORD_ACTIONS,
  type PasswordAction,
  secretOf,
} from '../data/two-factor';
import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { PasskeysCard } from './passkeys-card';

interface SecurityPageProps {
  auth: AuthClient;
  /** Section des passkeys (flag `account.passkeys` de l'app). */
  passkeys?: boolean;
  /** La 2FA ou l'exigence de l'organisation a changé : les accès du token aussi (ADR 0017). */
  onAccessChanged: () => Promise<void> | void;
}

function PasswordForm({
  onConfirm,
  onCancel,
}: {
  onConfirm: (password: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const form = useForm<{ password: string }>({
    resolver: zodResolver(confirmPasswordSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async ({ password }) => {
    try {
      await onConfirm(password);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <Stack gap={3}>
        <FormField
          label={t`Mot de passe`}
          type="password"
          autoComplete="current-password"
          error={errors.password && t`Saisissez votre mot de passe.`}
          {...form.register('password')}
        />
        <FormError message={errors.root?.message} />
        <Stack direction="row" gap={2} wrap>
          <Button type="submit" disabled={isSubmitting}>
            <Trans>Continuer</Trans>
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            <Trans>Annuler</Trans>
          </Button>
        </Stack>
      </Stack>
    </form>
  );
}

function ConfirmCodeForm({ onConfirm }: { onConfirm: (code: string) => Promise<void> }) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const form = useForm<{ code: string }>({
    resolver: zodResolver(totpCodeSchema),
    defaultValues: { code: '' },
  });
  const { errors, isSubmitting } = form.formState;
  const submit = form.handleSubmit(async ({ code }) => {
    try {
      await onConfirm(code);
    } catch (error) {
      form.setError('root', { message: errorMessage(error) });
    }
  });
  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <Stack gap={3}>
        <FormField
          label={t`Code de l’application d’authentification`}
          inputMode="numeric"
          autoComplete="one-time-code"
          error={errors.code && t`Saisissez les 6 chiffres du code.`}
          {...form.register('code')}
        />
        <FormError message={errors.root?.message} />
        <Button type="submit" disabled={isSubmitting}>
          <Trans>Confirmer</Trans>
        </Button>
      </Stack>
    </form>
  );
}

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { t } = useLingui();
  return (
    <Stack gap={3}>
      <Text>
        <Trans>
          Gardez ces codes en lieu sûr : chacun permet une connexion si vous perdez l’accès à votre
          application. Ils ne seront plus affichés.
        </Trans>
      </Text>
      <ul
        aria-label={t`Codes de secours`}
        className="grid grid-cols-2 gap-2 rounded-md bg-muted p-3 font-mono text-sm"
      >
        {codes.map((code) => (
          <li key={code} className="list-none">
            {code}
          </li>
        ))}
      </ul>
      <Button onClick={onDone}>
        <Trans>J’ai noté mes codes</Trans>
      </Button>
    </Stack>
  );
}

/**
 * Sécurité du compte : vérification en deux étapes (application d'authentification, codes de secours) et, pour
 * qui gère l'organisation active, son exigence pour tous les membres.
 */
export function SecurityPage({ auth, passkeys = false, onAccessChanged }: SecurityPageProps) {
  const { t } = useLingui();
  const queryClient = useQueryClient();
  const errorMessage = useAuthErrorMessage();
  const requirementId = useId();
  const session = useQuery(sessionQueryOptions(auth));
  const organizations = useQuery(organizationsQueryOptions(auth));
  const role = useQuery({
    queryKey: activeMemberRoleKey,
    queryFn: ({ signal }) => auth.getActiveMemberRole(signal),
    staleTime: 60_000,
    retry: false,
  });
  const [action, setAction] = useState<PasswordAction>();
  const [setupURI, setSetupURI] = useState<string>();
  const [shownCodes, setShownCodes] = useState<string[]>();
  const [requirementError, setRequirementError] = useState<string>();
  const [savingRequirement, setSavingRequirement] = useState(false);

  const enabled = session.data?.user.twoFactorEnabled === true;
  const activeId = session.data?.session.activeOrganizationId;
  const active = organizations.data?.find((organization) => organization.id === activeId);
  const required = active?.requireTwoFactor === true;
  // Une session ouverte par passkey vaut la 2FA qu'une organisation exige (ADR 0018).
  const secondFactor = enabled || session.data?.session.passkeySignIn === true;
  const manager = isManagerRole(role.data);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: authKeys.session() }),
      queryClient.invalidateQueries({ queryKey: authKeys.organizations() }),
    ]);

  const confirmPassword = async (password: string) => {
    if (action === PASSWORD_ACTIONS.enable) {
      const setup = await auth.enableTwoFactor(password);
      setSetupURI(setup.totpURI);
      setShownCodes(setup.backupCodes);
    } else if (action === PASSWORD_ACTIONS.disable) {
      await auth.disableTwoFactor(password);
      await refresh();
      await onAccessChanged();
    } else {
      setShownCodes(await auth.regenerateBackupCodes(password));
    }
    setAction(undefined);
  };

  const confirmSetup = async (code: string) => {
    await auth.confirmTwoFactor(code);
    setSetupURI(undefined);
    await refresh();
    await onAccessChanged();
  };

  const toggleRequirement = async (next: boolean) => {
    if (!active) return;
    setSavingRequirement(true);
    setRequirementError(undefined);
    try {
      await auth.setTwoFactorRequirement(active.id, next);
      await refresh();
      await onAccessChanged();
    } catch (error) {
      setRequirementError(errorMessage(error));
    } finally {
      setSavingRequirement(false);
    }
  };

  if (session.isPending) {
    return (
      <Text aria-live="polite" className="p-4">
        <Trans>Chargement…</Trans>
      </Text>
    );
  }

  return (
    <Stack as="section" gap={6} className="mx-auto w-full max-w-2xl p-4">
      <Heading level={1}>
        <Trans>Sécurité du compte</Trans>
      </Heading>
      {required && !secondFactor && active && (
        <Text tone="destructive">
          <Trans>
            {active.name} exige la vérification en deux étapes. Activez-la pour retrouver l’accès.
          </Trans>
        </Text>
      )}

      <Card>
        <CardHeader>
          <Stack direction="row" gap={3} align="center" justify="between" wrap>
            <CardTitle>
              <Heading level={2} className="text-base">
                <Trans>Vérification en deux étapes</Trans>
              </Heading>
            </CardTitle>
            {enabled ? (
              <Badge>
                <Trans>Activée</Trans>
              </Badge>
            ) : (
              <Badge variant="outline">
                <Trans>Désactivée</Trans>
              </Badge>
            )}
          </Stack>
          <CardDescription>
            <Trans>
              À la connexion, un code de votre application d’authentification est demandé après le
              mot de passe.
            </Trans>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {shownCodes && !setupURI ? (
            <BackupCodes codes={shownCodes} onDone={() => setShownCodes(undefined)} />
          ) : setupURI ? (
            <Stack gap={4}>
              <Text>
                <Trans>
                  Scannez ce QR code avec votre application d’authentification, puis saisissez le
                  code qu’elle affiche.
                </Trans>
              </Text>
              <div className="w-fit rounded-md bg-white p-3">
                <QRCode value={setupURI} size={160} title={t`QR code à scanner`} />
              </div>
              <Text size="sm" tone="muted">
                <Trans>Ou saisissez cette clé dans l’application :</Trans>{' '}
                <code className="font-mono break-all">{secretOf(setupURI)}</code>
              </Text>
              <ConfirmCodeForm onConfirm={confirmSetup} />
            </Stack>
          ) : action ? (
            <Stack gap={3}>
              {action === PASSWORD_ACTIONS.disable && required && active && (
                <Text tone="destructive">
                  <Trans>
                    {active.name} exige la vérification en deux étapes : sans elle, vous n’y aurez
                    plus accès.
                  </Trans>
                </Text>
              )}
              <PasswordForm onConfirm={confirmPassword} onCancel={() => setAction(undefined)} />
            </Stack>
          ) : enabled ? (
            <Stack direction="row" gap={2} wrap>
              <Button variant="outline" onClick={() => setAction(PASSWORD_ACTIONS.backupCodes)}>
                <Trans>Nouveaux codes de secours</Trans>
              </Button>
              <Button variant="outline" onClick={() => setAction(PASSWORD_ACTIONS.disable)}>
                <Trans>Désactiver</Trans>
              </Button>
            </Stack>
          ) : (
            <Button onClick={() => setAction(PASSWORD_ACTIONS.enable)}>
              <Trans>Activer</Trans>
            </Button>
          )}
        </CardContent>
      </Card>

      {passkeys && <PasskeysCard auth={auth} />}

      {manager && active && (
        <Card>
          <CardHeader>
            <CardTitle>
              <Heading level={2} className="text-base">
                <Trans>Organisation : {active.name}</Trans>
              </Heading>
            </CardTitle>
            <CardDescription>
              <Trans>
                Les membres sans vérification en deux étapes perdent aussitôt l’accès, jusqu’à ce
                qu’ils l’activent.
              </Trans>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Stack gap={2}>
              <Stack direction="row" gap={2} align="center">
                <input
                  id={requirementId}
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={required}
                  disabled={(!secondFactor && !required) || savingRequirement}
                  onChange={(event) => void toggleRequirement(event.target.checked)}
                />
                <Label htmlFor={requirementId}>
                  <Trans>Exiger la vérification en deux étapes de tous les membres</Trans>
                </Label>
              </Stack>
              {!secondFactor && !required && (
                <Text size="sm" tone="muted">
                  <Trans>Activez d’abord la vérification en deux étapes sur votre compte.</Trans>
                </Text>
              )}
              <FormError message={requirementError} />
            </Stack>
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
