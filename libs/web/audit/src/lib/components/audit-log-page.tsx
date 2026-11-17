import { useId } from 'react';
import { Trans, useLingui } from '@lingui/react/macro';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import type { AuditEntryResponse } from '@nx-react-nestjs/contracts';
import { ApiError, type ApiClient, type AuthClient } from '@nx-react-nestjs/web-data-access';
import { Button, Card, CardContent, Heading, Label, Stack, Text } from '@nx-react-nestjs/web-ui';

import {
  type AuditFilters,
  auditEntriesInfiniteQueryOptions,
  membersQueryOptions,
} from '../data/audit';
import { formatDateTime } from '../data/format-date';

export type { AuditFilters };

/** Libellés des actions connues ; une autre s'affiche telle qu'enregistrée. */
function useActionLabels(): Record<string, string> {
  const { t } = useLingui();
  return {
    'identity.signed-in': t`Connexion au compte`,
    'identity.member-invited': t`Membre invité`,
    'identity.member-joined': t`Membre arrivé`,
    'identity.member-removed': t`Membre retiré`,
    'identity.member-role-changed': t`Rôle modifié`,
    'identity.two-factor-requirement-changed': t`Exigence de la 2FA modifiée`,
    // example:start
    'orders.order-placed': t`Commande passée`,
    'orders.order-cancelled': t`Commande annulée`,
    // example:end
  };
}

interface EntryRowProps {
  entry: AuditEntryResponse;
  label: string;
  actorName: string | undefined;
  onActor: (actorId: string) => void;
}

function EntryRow({ entry, label, actorName, onActor }: EntryRowProps) {
  const { i18n } = useLingui();
  const details = Object.entries(entry.details);
  return (
    <Card>
      <CardContent>
        <Stack direction="row" gap={4} align="center" justify="between" wrap>
          <Stack gap={1}>
            <Text weight="semibold">{label}</Text>
            {entry.resource && (
              <Text as="span" size="sm" tone="muted">
                {entry.resource.type} {entry.resource.id}
              </Text>
            )}
            {details.length > 0 && (
              <Text as="span" size="sm" tone="muted">
                {details.map(([key, value]) => `${key} : ${String(value)}`).join(' · ')}
              </Text>
            )}
          </Stack>
          <Stack gap={1} align="end">
            {entry.actorId ? (
              <Button variant="link" size="sm" onClick={() => onActor(entry.actorId ?? '')}>
                {actorName ?? <Trans>Ancien membre ({entry.actorId.slice(0, 8)})</Trans>}
              </Button>
            ) : (
              <Text size="sm">
                <Trans>Système</Trans>
              </Text>
            )}
            <Text as="span" size="sm" tone="muted">
              <time dateTime={entry.occurredAt}>
                {formatDateTime(entry.occurredAt, i18n.locale)}
              </time>
            </Text>
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export interface AuditLogPageProps {
  api: ApiClient;
  auth: AuthClient;
  filters: AuditFilters;
  /** Nouveaux filtres, à porter dans l'URL. */
  onFiltersChange: (filters: AuditFilters) => void;
}

/** Journal d'audit du tenant, réservé au staff : qui a fait quoi, quand. */
export function AuditLogPage({ api, auth, filters, onFiltersChange }: AuditLogPageProps) {
  const { t } = useLingui();
  const selectId = useId();
  const labels = useActionLabels();
  const { data, error, isPending, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useInfiniteQuery(auditEntriesInfiniteQueryOptions(api, filters));
  const members = useQuery(membersQueryOptions(auth));
  const names = new Map(members.data?.map((member) => [member.userId, member.name]));
  const entries = data?.pages.flatMap((page) => page.items) ?? [];
  const forbidden = error instanceof ApiError && error.status === 403;
  const filtered = filters.action !== undefined || filters.actorId !== undefined;

  return (
    <Stack as="section" gap={6} className="p-4">
      <Heading level={1}>
        <Trans>Journal d’audit</Trans>
      </Heading>
      <Stack direction="row" gap={3} align="end" wrap>
        <Stack gap={1}>
          <Label htmlFor={selectId}>
            <Trans>Action</Trans>
          </Label>
          <select
            id={selectId}
            value={filters.action ?? ''}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            onChange={(event) => {
              const { action: _previous, ...rest } = filters;
              onFiltersChange(event.target.value ? { ...rest, action: event.target.value } : rest);
            }}
          >
            <option value="">{t`Toutes les actions`}</option>
            {Object.entries(labels).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
        </Stack>
        {filtered && (
          <Button variant="outline" onClick={() => onFiltersChange({})}>
            <Trans>Effacer les filtres</Trans>
          </Button>
        )}
      </Stack>
      {isPending ? (
        <Text aria-live="polite">
          <Trans>Chargement…</Trans>
        </Text>
      ) : forbidden ? (
        <Text role="alert" tone="destructive">
          <Trans>Le journal d’audit est réservé aux administrateurs de l’organisation.</Trans>
        </Text>
      ) : isError && entries.length === 0 ? (
        <Text role="alert" tone="destructive">
          <Trans>Impossible de charger le journal d’audit.</Trans>
        </Text>
      ) : entries.length === 0 ? (
        <Text tone="muted">
          <Trans>Aucune action enregistrée.</Trans>
        </Text>
      ) : (
        <Stack as="ul" aria-label={t`Journal d’audit`}>
          {entries.map((entry) => (
            <li key={entry.id} className="list-none">
              <EntryRow
                entry={entry}
                label={labels[entry.action] ?? entry.action}
                actorName={entry.actorId ? names.get(entry.actorId) : undefined}
                onActor={(actorId) => onFiltersChange({ ...filters, actorId })}
              />
            </li>
          ))}
        </Stack>
      )}
      {hasNextPage && (
        <Button
          variant="outline"
          disabled={isFetchingNextPage}
          onClick={() => void fetchNextPage()}
        >
          <Trans>Voir plus</Trans>
        </Button>
      )}
    </Stack>
  );
}
