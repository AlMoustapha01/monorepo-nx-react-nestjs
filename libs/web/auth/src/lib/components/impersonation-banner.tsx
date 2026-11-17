import { useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import type { AuthSession } from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, FormError, Stack, Text } from '@nx-react-nestjs/web-ui';

import { useAuthErrorMessage } from '../hooks/use-auth-error-message';

interface ImpersonationBannerProps {
  auth: AuthClient;
  session: AuthSession;
  /** Retour à la session de l'opérateur : l'app doit oublier le token et les données du client. */
  onStopped: () => Promise<void> | void;
}

/** Bandeau d'une session impersonée (ADR 0019) : l'opérateur sait toujours qu'il n'est pas chez lui. */
export function ImpersonationBanner({ auth, session, onStopped }: ImpersonationBannerProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (!session?.session.impersonatedBy) return null;
  const email = session.user.email;

  const stop = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await auth.stopImpersonating();
      await onStopped();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t`Session du support`}
      className="border-b border-destructive/40 bg-destructive/10 px-4 py-2"
    >
      <Stack direction="row" gap={4} align="center" justify="between" wrap>
        <Text size="sm" weight="semibold">
          <Trans>
            Vous voyez l’application comme {email}. Chaque action est inscrite à votre nom ; la
            session prend fin au bout d’une heure.
          </Trans>
        </Text>
        <Button size="sm" disabled={busy} onClick={() => void stop()}>
          <Trans>Revenir à mon compte</Trans>
        </Button>
      </Stack>
      <FormError message={error} />
    </section>
  );
}
