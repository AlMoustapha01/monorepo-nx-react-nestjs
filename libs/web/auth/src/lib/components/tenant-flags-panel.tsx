import { useId, useState } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type TenantFeatureFlags,
  type TenantFlagValue,
  tenantFlagValueSchema,
} from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import { FormError, Label, Stack, Text } from '@nx-react-nestjs/web-ui';

import { authKeys } from '../data/queries';
import { useAuthErrorMessage } from '../hooks/use-auth-error-message';

type Flag = TenantFeatureFlags['flags'][number];

const { on: ON, off: OFF, default: DEFAULT } = tenantFlagValueSchema.enum;

const valueOf = (flag: Flag): TenantFlagValue =>
  flag.override === null ? DEFAULT : flag.override ? ON : OFF;

function FlagRow({ flag, onChange }: { flag: Flag; onChange: (value: TenantFlagValue) => void }) {
  const { t } = useLingui();
  const id = useId();
  const name = flag.flag;
  return (
    <li className="list-none">
      <Stack direction="row" gap={4} align="center" justify="between" wrap>
        <Stack gap={1}>
          <Label htmlFor={id} className="font-mono">
            <span className="sr-only">
              <Trans>Valeur de</Trans>{' '}
            </span>
            {name}
          </Label>
          <Text as="span" size="sm" tone="muted">
            {flag.description}
          </Text>
        </Stack>
        <select
          id={id}
          value={valueOf(flag)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          onChange={(event) => onChange(event.target.value as TenantFlagValue)}
        >
          <option value={DEFAULT}>
            {flag.catalogDefault ? t`Comme tous (activé)` : t`Comme tous (désactivé)`}
          </option>
          <option value={ON}>{t`Activé pour cette organisation`}</option>
          <option value={OFF}>{t`Désactivé pour cette organisation`}</option>
        </select>
      </Stack>
    </li>
  );
}

/**
 * Flags d'une organisation au back-office (ADR 0020) : ouvrir une fonctionnalité à un client pilote, ou la lui
 * retirer. Chaque changement va au journal d'audit du client ; l'API l'applique dès la requête suivante.
 */
export function TenantFlagsPanel({
  auth,
  organization,
}: {
  auth: AuthClient;
  organization: { id: string; name: string };
}) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string>();
  const key = authKeys.tenantFlags(organization.id);
  const flags = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => auth.getTenantFeatureFlags(organization.id, signal),
    staleTime: 0,
    retry: false,
  });
  const { name } = organization;

  const change = async (flag: string, value: TenantFlagValue) => {
    setError(undefined);
    try {
      queryClient.setQueryData(
        key,
        await auth.setTenantFeatureFlag({ organizationId: organization.id, flag, value }),
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };

  return (
    <section aria-label={t`Flags de ${name}`} className="rounded-md bg-muted/50 p-3">
      <Stack gap={3}>
        <Text size="sm" tone="muted">
          <Trans>
            « Comme tous » suit la valeur du catalogue, que la variable FEATURE_FLAGS de l’API peut
            changer. Un changement s’applique dès la requête suivante.
          </Trans>
        </Text>
        {flags.isPending && (
          <Text aria-live="polite" size="sm">
            <Trans>Chargement…</Trans>
          </Text>
        )}
        {flags.isError && <FormError message={errorMessage(flags.error)} />}
        {flags.data?.flags.length === 0 && (
          <Text size="sm">
            <Trans>Aucun flag dans le catalogue.</Trans>
          </Text>
        )}
        {flags.data && flags.data.flags.length > 0 && (
          <ul className="flex flex-col gap-3">
            {flags.data.flags.map((flag) => (
              <FlagRow
                key={flag.flag}
                flag={flag}
                onChange={(value) => void change(flag.flag, value)}
              />
            ))}
          </ul>
        )}
        <FormError message={error} />
      </Stack>
    </section>
  );
}
