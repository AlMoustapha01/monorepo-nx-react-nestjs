import { signUpSchema } from './auth';

describe('signUpSchema', () => {
  it('normalizes the email and rejects a password that is too short', () => {
    expect(
      signUpSchema.parse({ name: ' Ada ', email: ' Ada@Shop.TEST ', password: 'long-enough' }),
    ).toEqual({ name: 'Ada', email: 'ada@shop.test', password: 'long-enough' });
    expect(
      signUpSchema.safeParse({ name: 'Ada', email: 'ada@shop.test', password: 'short' }).success,
    ).toBe(false);
  });
});
