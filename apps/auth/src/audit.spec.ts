import { randomUUID } from 'node:crypto';
import { identityAuditEntries } from './audit';

const owner = randomUUID();
const ada = randomUUID();
const tenant = randomUUID();
const member = { userId: ada, organizationId: tenant, role: 'admin', email: 'ada@shop.test' };

const request = (overrides: Partial<Parameters<typeof identityAuditEntries>[0]>) =>
  identityAuditEntries({
    path: '/organization/remove-member',
    sessionUserId: owner,
    newSession: undefined,
    returned: undefined,
    ...overrides,
  });

describe('identityAuditEntries', () => {
  it('records a sign-in in the organization the new session opens', () => {
    expect(
      request({
        path: '/sign-in/email',
        sessionUserId: undefined,
        newSession: { userId: ada, activeOrganizationId: tenant },
      }),
    ).toEqual([
      {
        tenantId: tenant,
        actorId: ada,
        action: 'identity.signed-in',
        resource: { type: 'user', id: ada },
        details: { method: 'sign-in/email' },
      },
    ]);
  });

  it('records a sign-in with a passkey', () => {
    expect(
      request({
        path: '/passkey/verify-authentication',
        sessionUserId: undefined,
        newSession: { userId: ada, activeOrganizationId: tenant },
      }),
    ).toEqual([
      expect.objectContaining({
        action: 'identity.signed-in',
        details: { method: 'passkey/verify-authentication' },
      }),
    ]);
  });

  it('records a sign-in by the link of the verification email, not a rewritten session cookie', () => {
    const opened = { userId: ada, activeOrganizationId: tenant };
    expect(request({ path: '/verify-email', newSession: opened })).toHaveLength(1);
    // Better Auth pose aussi une session neuve quand il réécrit le cookie : ce ne sont pas des connexions.
    for (const path of [
      '/organization/set-active',
      '/get-session',
      '/token',
      '/update-user',
      '/change-password',
    ]) {
      expect(request({ path, sessionUserId: ada, newSession: opened })).toEqual([]);
    }
  });

  it('records a sign-in completed by the second factor, not the confirmation of a new 2FA', () => {
    const opened = { userId: ada, activeOrganizationId: tenant };
    for (const path of ['/two-factor/verify-totp', '/two-factor/verify-backup-code']) {
      expect(request({ path, sessionUserId: undefined, newSession: opened })).toEqual([
        expect.objectContaining({
          action: 'identity.signed-in',
          details: { method: path.slice(1) },
        }),
      ]);
      // Avec une session : l'utilisateur confirme sa 2FA, il était déjà connecté.
      expect(request({ path, sessionUserId: ada, newSession: opened })).toEqual([]);
    }
  });

  it('records a change of the 2FA requirement of the organization, not its other updates', () => {
    const organization = { id: tenant, name: 'Atelier', requireTwoFactor: true };
    expect(
      request({
        path: '/organization/update',
        body: { data: { requireTwoFactor: true } },
        returned: organization,
      }),
    ).toEqual([
      {
        tenantId: tenant,
        actorId: owner,
        action: 'identity.two-factor-requirement-changed',
        resource: { type: 'organization', id: tenant },
        details: { required: true },
      },
    ]);
    expect(
      request({
        path: '/organization/update',
        body: { data: { name: 'X' } },
        returned: organization,
      }),
    ).toEqual([]);
    // Créée en l'exigeant déjà : la trace commence avec l'organisation.
    expect(request({ path: '/organization/create', returned: organization })).toEqual([
      expect.objectContaining({
        action: 'identity.two-factor-requirement-changed',
        details: { required: true },
      }),
    ]);
    expect(
      request({
        path: '/organization/create',
        returned: { ...organization, requireTwoFactor: false },
      }),
    ).toEqual([]);
  });

  it('records nothing for a sign-in without organization: there is no tenant to write to', () => {
    expect(
      request({ path: '/sign-in/email', newSession: { userId: ada, activeOrganizationId: null } }),
    ).toEqual([]);
  });

  it('records who removed which member, with the role, never the email', () => {
    const [entry] = request({ returned: { member } });

    expect(entry).toEqual({
      tenantId: tenant,
      actorId: owner,
      action: 'identity.member-removed',
      resource: { type: 'member', id: ada },
      details: { role: 'admin' },
    });
    expect(JSON.stringify(entry)).not.toContain('ada@shop.test');
  });

  it('records an invitation, a member who joins and a role change', () => {
    const invitationId = randomUUID();
    expect(
      request({
        path: '/organization/invite-member',
        returned: {
          id: invitationId,
          organizationId: tenant,
          role: 'member',
          email: 'x@shop.test',
        },
      }),
    ).toEqual([
      expect.objectContaining({
        action: 'identity.member-invited',
        resource: { type: 'invitation', id: invitationId },
        details: { role: 'member' },
      }),
    ]);
    expect(
      request({
        path: '/organization/accept-invitation',
        sessionUserId: ada,
        returned: { member },
      }),
    ).toEqual([expect.objectContaining({ action: 'identity.member-joined', actorId: ada })]);
    expect(request({ path: '/organization/update-member-role', returned: member })).toEqual([
      expect.objectContaining({
        action: 'identity.member-role-changed',
        details: { role: 'admin' },
      }),
    ]);
  });

  it('records nothing for another path or an unexpected response', () => {
    expect(
      request({ path: '/organization/list-members', returned: { members: [member] } }),
    ).toEqual([]);
    expect(request({ returned: { member: { userId: ada } } })).toEqual([]);
  });
});
