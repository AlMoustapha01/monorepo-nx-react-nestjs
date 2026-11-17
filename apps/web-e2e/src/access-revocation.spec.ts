import { type APIRequestContext, expect, request, test } from '@playwright/test';

import { E2E_PORTS } from './stack';
import { type Account, createAccount, createOrganization } from './support';

async function ok<T>(what: string, response: Awaited<ReturnType<APIRequestContext['post']>>) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

const tokenOf = async (account: Account) =>
  (await ok<{ token: string }>('token', await account.auth.get('token'))).token;

/** Lecture réservée au staff : elle montre les droits que l'API accorde à un token. */
async function readAuditLog(token: string): Promise<number> {
  const api = await request.newContext({ baseURL: `http://localhost:${E2E_PORTS.api}/api/v1/` });
  const response = await api.get('audit/entries', {
    headers: { authorization: `Bearer ${token}` },
  });
  await api.dispose();
  return response.status();
}

/** ADR 0016 : le service d'identité révoque, l'API refuse aussitôt le token, sans attendre ses 15 minutes. */
test('an admin demoted to member loses the staff rights at once, not when the token expires', async () => {
  const owner = await createAccount('revoke-owner');
  const organizationId = await createOrganization(owner, 'Atelier');
  const admin = await createAccount('revoke-admin');
  const invitation = await ok<{ id: string }>(
    'invitation',
    await owner.auth.post('organization/invite-member', {
      data: { email: admin.email, role: 'admin', organizationId },
    }),
  );
  await ok(
    'accept',
    await admin.auth.post('organization/accept-invitation', {
      data: { invitationId: invitation.id },
    }),
  );
  await ok(
    'active',
    await admin.auth.post('organization/set-active', { data: { organizationId } }),
  );

  const staffToken = await tokenOf(admin);
  expect(await readAuditLog(staffToken)).toBe(200);

  const { members } = await ok<{
    members: { id: string; userId: string; user: { email: string } }[];
  }>('members', await owner.auth.get(`organization/list-members?organizationId=${organizationId}`));
  const member = members.find((candidate) => candidate.user.email === admin.email);
  await ok(
    'demote',
    await owner.auth.post('organization/update-member-role', {
      data: { memberId: member?.id, role: 'member', organizationId },
    }),
  );

  // Le même token, encore valable plus de 14 minutes : refusé.
  expect(await readAuditLog(staffToken)).toBe(401);
  // Un token émis après la seconde de la révocation porte le nouveau rôle (ADR 0016).
  await new Promise((resolve) => setTimeout(resolve, 1_100));
  expect(await readAuditLog(await tokenOf(admin))).toBe(403);
});
