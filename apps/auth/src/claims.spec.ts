import { apiClaims } from './claims';

describe('apiClaims', () => {
  const user = { email: 'ada@shop.test', emailVerified: true };
  const organizationId = '0b8f3c9e-4a0e-4f7c-9a57-5d7c1b0f2e11';

  it('donne le tenant et le rôle staff à un propriétaire', () => {
    expect(apiClaims({ user, membership: { organizationId, role: 'owner' } })).toEqual({
      tenant_id: organizationId,
      roles: ['staff'],
      email: user.email,
    });
  });

  it('lit les rôles multiples de Better Auth', () => {
    expect(
      apiClaims({ user, membership: { organizationId, role: 'member, admin' } }),
    ).toMatchObject({ roles: ['staff'] });
  });

  it('ne donne aucun rôle à un simple membre', () => {
    expect(apiClaims({ user, membership: { organizationId, role: 'member' } })).toMatchObject({
      roles: [],
    });
  });

  it('omet le tenant sans organisation active', () => {
    expect(apiClaims({ user })).not.toHaveProperty('tenant_id');
  });

  it('omet un email non vérifié', () => {
    expect(apiClaims({ user: { ...user, emailVerified: false } })).not.toHaveProperty('email');
  });
});
