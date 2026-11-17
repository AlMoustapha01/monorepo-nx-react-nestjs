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

  it('gives no tenant, nor role, to a member without 2FA in an organization that requires it', () => {
    const membership = { organizationId, role: 'owner', requireTwoFactor: true };
    expect(apiClaims({ user, membership })).toEqual({ roles: [], email: user.email });
    expect(apiClaims({ user: { ...user, twoFactorEnabled: true }, membership })).toEqual({
      tenant_id: organizationId,
      roles: ['staff'],
      email: user.email,
    });
  });

  it('accepts a session opened with a passkey instead of 2FA', () => {
    const membership = { organizationId, role: 'member', requireTwoFactor: true };
    expect(apiClaims({ user, membership, session: { passkeySignIn: true } })).toMatchObject({
      tenant_id: organizationId,
    });
    expect(apiClaims({ user, membership, session: { passkeySignIn: false } })).not.toHaveProperty(
      'tenant_id',
    );
  });

  it('names the operator behind an impersonated session, which counts as 2FA', () => {
    const operatorId = '0e8f2d5e-1c1e-4a54-b1d4-8c2f9a7b6d01';
    const membership = { organizationId, role: 'member', requireTwoFactor: true };
    expect(apiClaims({ user, membership, session: { impersonatedBy: operatorId } })).toEqual({
      tenant_id: organizationId,
      roles: [],
      email: user.email,
      act: { sub: operatorId },
    });
  });

  it('omits the tenant without an active organization', () => {
    expect(apiClaims({ user })).not.toHaveProperty('tenant_id');
  });

  it('omits an unverified email', () => {
    expect(apiClaims({ user: { ...user, emailVerified: false } })).not.toHaveProperty('email');
  });
});
