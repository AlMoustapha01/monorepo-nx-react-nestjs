import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans } from '@lingui/react/macro';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, FormError, Stack, Text } from '@nx-react-nestjs/web-ui';

import { invitationQueryOptions } from '../data/queries';
import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
import { AuthCard } from './auth-card';

interface AcceptInvitationPageProps {
  auth: AuthClient;
  invitationId: string;
  /** L'organisation rejointe est devenue l'organisation active de la session. */
  onAccepted: () => Promise<void> | void;
}

export function AcceptInvitationPage({
  auth,
  invitationId,
  onAccepted,
}: AcceptInvitationPageProps) {
  const errorMessage = useAuthErrorMessage();
  const invitation = useQuery(invitationQueryOptions(auth, invitationId));
  const [error, setError] = useState<string>();
  const [accepting, setAccepting] = useState(false);

  const accept = async () => {
    setAccepting(true);
    setError(undefined);
    try {
      await auth.acceptInvitation(invitationId);
      await onAccepted();
    } catch (cause) {
      setError(errorMessage(cause));
      setAccepting(false);
    }
  };

  if (invitation.isPending) {
    return (
      <AuthCard title={<Trans>Invitation</Trans>}>
        <Text tone="muted" aria-live="polite">
          <Trans>Chargement…</Trans>
        </Text>
      </AuthCard>
    );
  }
  if (invitation.isError) {
    return (
      <AuthCard title={<Trans>Invitation</Trans>}>
        <FormError message={errorMessage(invitation.error)} />
      </AuthCard>
    );
  }
  if (invitation.data.status !== 'pending') {
    return (
      <AuthCard title={<Trans>Invitation</Trans>}>
        <Text role="alert">
          <Trans>Cette invitation a déjà été utilisée ou annulée.</Trans>
        </Text>
      </AuthCard>
    );
  }

  const { organizationName, email } = invitation.data;
  return (
    <AuthCard title={<Trans>Rejoindre {organizationName}</Trans>}>
      <Stack gap={4}>
        <Text>
          <Trans>
            Vous êtes invité à rejoindre {organizationName} avec l'adresse {email}.
          </Trans>
        </Text>
        <FormError message={error} />
        <Button onClick={() => void accept()} disabled={accepting}>
          <Trans>Accepter l'invitation</Trans>
        </Button>
      </Stack>
    </AuthCard>
  );
}
