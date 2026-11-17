import { type ReactNode, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Trans, useLingui } from '@lingui/react/macro';
import { useQuery } from '@tanstack/react-query';
import { accountSearchSchema, type FoundAccount } from '@nx-react-nestjs/contracts';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';
import {
  Button,
  Card,
  CardContent,
  FormError,
  FormField,
  Heading,
  Stack,
  Text,
} from '@nx-react-nestjs/web-ui';

import { authKeys } from '../data/queries';
import { useAuthErrorMessage } from '../hooks/use-auth-error-message';
// option:feature-flags:start
import { TenantFlagsPanel } from './tenant-flags-panel';
// option:feature-flags:end

interface BackOfficePageProps {
  auth: AuthClient;
  /** Session impersonée ouverte : l'app doit oublier son token et ses données, puis aller à l'accueil. */
  onImpersonated: () => Promise<void> | void;
  // option:feature-flags:start
  /** Flags de chaque organisation trouvée, à surcharger pour elle (ADR 0020). */
  featureFlags?: boolean;
  // option:feature-flags:end
}

// option:feature-flags:start
function OrganizationFlags({
  auth,
  organizations,
}: {
  auth: AuthClient;
  organizations: FoundAccount['organizations'];
}) {
  const [open, setOpen] = useState<string>();
  const shown = organizations.find((organization) => organization.id === open);
  if (organizations.length === 0) return null;
  return (
    <Stack gap={3}>
      <Stack direction="row" gap={2} wrap>
        {organizations.map((organization) => {
          const { name } = organization;
          return (
            <Button
              key={organization.id}
              variant="ghost"
              size="sm"
              aria-expanded={open === organization.id}
              onClick={() => setOpen(open === organization.id ? undefined : organization.id)}
            >
              <Trans>Flags de {name}</Trans>
            </Button>
          );
        })}
      </Stack>
      {shown && <TenantFlagsPanel auth={auth} organization={shown} />}
    </Stack>
  );
}
// option:feature-flags:end

function AccountRow({
  account,
  onSee,
  busy,
  children,
}: {
  account: FoundAccount;
  onSee: () => void;
  busy: boolean;
  /** Sous la ligne : outils propres au compte (flags de ses organisations). */
  children?: ReactNode;
}) {
  const { email } = account;
  return (
    <li className="list-none">
      <Card>
        <CardContent>
          <Stack gap={4}>
            <Stack direction="row" gap={4} align="center" justify="between" wrap>
              <Stack gap={1}>
                <Text weight="semibold">{account.email}</Text>
                <Text as="span" size="sm" tone="muted">
                  {account.name}
                </Text>
                <Text as="span" size="sm" tone="muted">
                  {account.organizations.length > 0 ? (
                    account.organizations
                      .map((organization) => `${organization.name} (${organization.role})`)
                      .join(' · ')
                  ) : (
                    <Trans>Aucune organisation</Trans>
                  )}
                </Text>
              </Stack>
              <Button variant="outline" disabled={busy} onClick={onSee}>
                <Trans>
                  Voir comme <span className="sr-only">{email}</span>
                </Trans>
              </Button>
            </Stack>
            {children}
          </Stack>
        </CardContent>
      </Card>
    </li>
  );
}

/**
 * Back-office des opérateurs de la plateforme (ADR 0019) : trouver un compte, puis voir l'application comme son
 * utilisateur, une heure au plus. Le client le voit dans son journal d'audit.
 */
export function BackOfficePage({
  auth,
  onImpersonated,
  // option:feature-flags:start
  featureFlags = false,
  // option:feature-flags:end
}: BackOfficePageProps) {
  const { t } = useLingui();
  const errorMessage = useAuthErrorMessage();
  const [query, setQuery] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [impersonationError, setImpersonationError] = useState<string>();
  const form = useForm<{ query: string }>({
    resolver: zodResolver(accountSearchSchema),
    defaultValues: { query: '' },
  });
  const results = useQuery({
    queryKey: authKeys.accountSearch(query ?? ''),
    queryFn: ({ signal }) => auth.searchAccounts(query ?? '', signal),
    enabled: query !== undefined,
    staleTime: 0,
    retry: false,
  });
  const submit = form.handleSubmit((values) => {
    setImpersonationError(undefined);
    setQuery(values.query.trim());
  });

  const see = async (userId: string) => {
    setBusy(true);
    setImpersonationError(undefined);
    try {
      await auth.impersonate(userId);
      await onImpersonated();
    } catch (error) {
      setImpersonationError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Stack as="section" gap={6} className="mx-auto w-full max-w-3xl p-4">
      <Stack gap={2}>
        <Heading level={1}>
          <Trans>Back-office</Trans>
        </Heading>
        <Text tone="muted">
          <Trans>
            Voir l’application comme un client, pour l’aider : une heure au plus, inscrit dans le
            journal d’audit de ses organisations.
          </Trans>
        </Text>
      </Stack>
      <search>
        <form noValidate onSubmit={(event) => void submit(event)}>
          <Stack direction="row" gap={2} align="end" wrap>
            <div className="min-w-64 flex-1">
              <FormField
                label={t`Email, nom ou organisation`}
                type="search"
                error={form.formState.errors.query && t`Saisissez au moins 2 caractères.`}
                {...form.register('query')}
              />
            </div>
            <Button type="submit">
              <Trans>Rechercher</Trans>
            </Button>
          </Stack>
        </form>
      </search>
      <FormError message={impersonationError} />
      {results.isError && <FormError message={errorMessage(results.error)} />}
      {results.isFetching && (
        <Text aria-live="polite" tone="muted">
          <Trans>Recherche…</Trans>
        </Text>
      )}
      {results.data?.length === 0 && (
        <Text>
          <Trans>Aucun compte ne correspond.</Trans>
        </Text>
      )}
      {results.data && results.data.length > 0 && (
        <ul aria-label={t`Comptes trouvés`} className="flex flex-col gap-3">
          {results.data.map((account) => (
            <AccountRow
              key={account.id}
              account={account}
              busy={busy}
              onSee={() => void see(account.id)}
            >
              {/* option:feature-flags:start */}
              {featureFlags && (
                <OrganizationFlags auth={auth} organizations={account.organizations} />
              )}
              {/* option:feature-flags:end */}
            </AccountRow>
          ))}
        </ul>
      )}
    </Stack>
  );
}
