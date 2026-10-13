import { describe, expect, it } from 'vitest';
import { createAccountSchema, loginSchema, updateAccountSchema } from '../../../src/validators/account.validator';

describe('createAccountSchema', () => {
  it('accepts a valid account', () => {
    expect(createAccountSchema.safeParse({ email: 'a@b.co', password: '12345678', name: 'A' }).success).toBe(true);
  });

  it('treats name as optional', () => {
    expect(createAccountSchema.safeParse({ email: 'a@b.co', password: '12345678' }).success).toBe(true);
  });

  it.each([
    ['bad email', { email: 'nope', password: '12345678' }],
    ['short password', { email: 'a@b.co', password: '1234567' }],
    ['empty name', { email: 'a@b.co', password: '12345678', name: '' }],
    ['missing password', { email: 'a@b.co' }],
  ])('rejects %s', (_label, body) => {
    expect(createAccountSchema.safeParse(body).success).toBe(false);
  });
});

describe('updateAccountSchema', () => {
  it('accepts a partial update', () => {
    expect(updateAccountSchema.safeParse({ name: 'New' }).success).toBe(true);
  });

  it('rejects an empty body', () => {
    expect(updateAccountSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a short password', () => {
    expect(updateAccountSchema.safeParse({ password: 'short' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts email + password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  it('rejects an empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});
