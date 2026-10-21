import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Trans, useLingui } from '@lingui/react/macro';
import type { AuthSession } from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, Label, Stack, Text } from '@nx-react-nestjs/web-ui';

import { organizationsQueryOptions } from '../data/queries';
import { useAuthErrorMessage } from '../hooks/use-auth-error-message';

interface AccountMenuProps {
  auth: AuthClient;
  session: NonNullable<AuthSession>;
  /** Le tenant change : l'app doit oublier son token et ses données en cache. */
  onOrganizationChanged: () => Promise<void> | void;
  onSignedOut: () => Promise<void> | void;
  onError: (message: string) => void;
}

/** En-tête : utilisateur, organisation active (changeable s'il en a plusieurs), déconnexion. */
export function AccountMenu({
  auth,
  session,
  onOrganizationChanged,
  onSignedOut,
  onError,
}: AccountMenuProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const selectId = useId();
  const organizations = useQuery(organizationsQueryOptions(auth));
  const [busy, setBusy] = useState(false);
  const activeId = session.session.activeOrganizationId ?? '';

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const list = organizations.data ?? [];
  const active = list.find((organization) => organization.id === activeId);

  return (
    <Stack direction="row" gap={3} align="center" wrap>
      <Text size="sm" tone="muted">
        {session.user.email}
      </Text>
      {list.length > 1 ? (
        <Stack direction="row" gap={2} align="center">
          <Label htmlFor={selectId} className="sr-only">
            <Trans>Organisation</Trans>
          </Label>
          <select
            id={selectId}
            value={activeId}
            disabled={busy}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
            onChange={(event) =>
              void run(async () => {
                await auth.setActiveOrganization(event.target.value);
                await onOrganizationChanged();
              })
            }
          >
            {list.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </Stack>
      ) : (
        active && (
          <Text size="sm" weight="semibold">
            {active.name}
          </Text>
        )
      )}
      <Button
        variant="ghost"
        disabled={busy}
        aria-label={t`Se déconnecter`}
        onClick={() =>
          void run(async () => {
            await auth.signOut();
            await onSignedOut();
          })
        }
      >
        <Trans>Déconnexion</Trans>
      </Button>
    </Stack>
  );
}
