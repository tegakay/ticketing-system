import { describe, expect, it, vi } from 'vitest';
import { authenticate, requireRole, requireSelfOrRole } from '../../../src/middleware/auth';
import { ADMIN, tokenFor, USER } from '../../setup/auth';
import { mockReq, mockRes } from '../../setup/http';

describe('authenticate', () => {
  it('returns 401 without an Authorization header', () => {
    const res = mockRes();
    const next = vi.fn();
    authenticate(mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a non-Bearer scheme', () => {
    const res = mockRes();
    authenticate(mockReq({ headers: { authorization: `Basic ${tokenFor(USER)}` } }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 401 for an invalid token', () => {
    const res = mockRes();
    const next = vi.fn();
    authenticate(mockReq({ headers: { authorization: 'Bearer not-a-jwt' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'Invalid or expired token' });
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.user and calls next for a valid token', () => {
    const req = mockReq({ headers: { authorization: `Bearer ${tokenFor(USER)}` } });
    const next = vi.fn();
    authenticate(req, mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
    expect(req.user).toMatchObject({ id: USER.id, role: 'USER' });
  });
});

describe('requireRole', () => {
  it('returns 403 when there is no user', () => {
    const res = mockRes();
    requireRole('ADMIN')(mockReq(), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 for the wrong role', () => {
    const res = mockRes();
    const next = vi.fn();
    requireRole('ADMIN')(mockReq({ user: { ...USER, email: 'u@x.co' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for an allowed role', () => {
    const next = vi.fn();
    requireRole('USER', 'ADMIN')(mockReq({ user: { ...ADMIN, email: 'a@x.co' } }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });
});

describe('requireSelfOrRole', () => {
  it('returns 401 when there is no user', () => {
    const res = mockRes();
    requireSelfOrRole('ADMIN')(mockReq({ params: { id: USER.id } }), res, vi.fn());
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('allows the user to access their own resource', () => {
    const next = vi.fn();
    requireSelfOrRole('ADMIN')(mockReq({ params: { id: USER.id }, user: { ...USER, email: 'u@x.co' } }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("allows an admin to access someone else's resource", () => {
    const next = vi.fn();
    requireSelfOrRole('ADMIN')(mockReq({ params: { id: USER.id }, user: { ...ADMIN, email: 'a@x.co' } }), mockRes(), next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("returns 403 for another user's resource", () => {
    const res = mockRes();
    const next = vi.fn();
    requireSelfOrRole('ADMIN')(mockReq({ params: { id: 'someone-else' }, user: { ...USER, email: 'u@x.co' } }), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
