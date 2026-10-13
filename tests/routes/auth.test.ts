import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';
import { verifyToken } from '../../src/utils/jwt';
import { hashPassword } from '../../src/utils/password';
import { bearer, USER } from '../setup/auth';
import { makeUser } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';

describe('POST /api/v1/auth/login', () => {
  it('returns a token for valid credentials', async () => {
    prismaMock.user.findUnique.mockResolvedValue(makeUser({ password: await hashPassword('Secret123!') }));

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'user@example.com', password: 'Secret123!' });

    expect(res.status).toBe(200);
    expect(verifyToken(res.body.token)).toMatchObject({ id: 'user-1', email: 'user@example.com', role: 'USER' });
    expect(prismaMock.user.findUnique).toHaveBeenCalledWith({ where: { email: 'user@example.com' } });
  });

  it('returns 401 for an unknown email', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'x' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns the same 401 for a wrong password (no user enumeration)', async () => {
    prismaMock.user.findUnique.mockResolvedValue(makeUser({ password: await hashPassword('Secret123!') }));
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'user@example.com', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid email or password' });
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('requires authentication', async () => {
    expect((await request(app).post('/api/v1/auth/logout')).status).toBe(401);
  });

  it('succeeds with a valid token', async () => {
    const res = await request(app).post('/api/v1/auth/logout').set('Authorization', bearer(USER));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ message: 'Logged out successfully' });
  });
});
