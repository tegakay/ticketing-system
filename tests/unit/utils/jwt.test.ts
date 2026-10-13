import jwt from 'jsonwebtoken';
import { describe, expect, it } from 'vitest';
import { generateToken, verifyToken } from '../../../src/utils/jwt';

const payload = { id: 'user-1', email: 'user@example.com', role: 'USER' as const };

describe('jwt utils', () => {
  it('round-trips the payload', () => {
    const decoded = verifyToken(generateToken(payload));
    expect(decoded).toMatchObject(payload);
    expect(decoded).toHaveProperty('exp');
  });

  it('rejects a tampered token', () => {
    const token = generateToken(payload);
    const [header, , signature] = token.split('.');
    const forgedBody = Buffer.from(JSON.stringify({ ...payload, role: 'ADMIN' })).toString('base64url');
    expect(() => verifyToken(`${header}.${forgedBody}.${signature}`)).toThrow();
  });

  it('rejects a token signed with another secret', () => {
    expect(() => verifyToken(jwt.sign(payload, 'other-secret'))).toThrow();
  });

  it('rejects an expired token', () => {
    const expired = jwt.sign(payload, 'test-secret', { expiresIn: -10 });
    expect(() => verifyToken(expired)).toThrow(/expired/);
  });
});
