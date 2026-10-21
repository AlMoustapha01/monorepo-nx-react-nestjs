import { queryOptions } from '@tanstack/react-query';
import type { AuthClient } from '@nx-react-nestjs/web-data-access';

export const authKeys = {
  all: ['auth'] as const,
  session: () => [...authKeys.all, 'session'] as const,
  organizations: () => [...authKeys.all, 'organizations'] as const,
  invitation: (id: string) => [...authKeys.all, 'invitation', id] as const,
};

/** Session du service d'identité ; relue à chaque navigation au-delà d'une minute. */
export function sessionQueryOptions(auth: AuthClient) {
  return queryOptions({
    queryKey: authKeys.session(),
    queryFn: ({ signal }) => auth.getSession(signal),
    staleTime: 60_000,
  });
}

export function organizationsQueryOptions(auth: AuthClient) {
  return queryOptions({
    queryKey: authKeys.organizations(),
    queryFn: ({ signal }) => auth.listOrganizations(signal),
    staleTime: 60_000,
  });
}

export function invitationQueryOptions(auth: AuthClient, invitationId: string) {
  return queryOptions({
    queryKey: authKeys.invitation(invitationId),
    queryFn: ({ signal }) => auth.getInvitation(invitationId, signal),
    staleTime: 60_000,
  });
}
