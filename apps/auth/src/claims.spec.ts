import { apiClaims } from './claims';

describe('apiClaims', () => {
  const user = { email: 'ada@shop.test', emailVerified: true };
  const organizationId = '0b8f3c9e-4a0e-4f7c-9a57-5d7c1b0f2e11';

  it('gives an owner the tenant and the staff role', () => {
    expect(apiClaims({ user, membership: { organizationId, role: 'owner' } })).toEqual({
      tenant_id: organizationId,
      roles: ['staff'],
      email: user.email,
    });
  });

  it('reads multiple Better Auth roles', () => {
    expect(
      apiClaims({ user, membership: { organizationId, role: 'member, admin' } }),
    ).toMatchObject({ roles: ['staff'] });
  });

  it('gives no role to a plain member', () => {
    expect(apiClaims({ user, membership: { organizationId, role: 'member' } })).toMatchObject({
      roles: [],
    });
  });

  it('omits the tenant without an active organization', () => {
    expect(apiClaims({ user })).not.toHaveProperty('tenant_id');
  });

  it('omits an unverified email', () => {
    expect(apiClaims({ user: { ...user, emailVerified: false } })).not.toHaveProperty('email');
  });
});
