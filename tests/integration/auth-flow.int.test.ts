import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestInfra, loadHarness, type Harness } from './setup/harness';

describe.skipIf(!hasTestInfra)('register → login → profile against real Postgres', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await loadHarness();
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterAll(async () => {
    await h?.shutdown();
  });

  it('lets a new user register, log in and read only their own profile', async () => {
    const register = await request(h.app)
      .post('/api/v1/users')
      .send({ email: 'new@example.com', password: 'Secret123!', name: 'New' });
    expect(register.status).toBe(201);
    expect(register.body).not.toHaveProperty('password');
    const userId = register.body.id;

    const login = await request(h.app).post('/api/v1/auth/login').send({ email: 'new@example.com', password: 'Secret123!' });
    expect(login.status).toBe(200);
    const auth = `Bearer ${login.body.token}`;

    const own = await request(h.app).get(`/api/v1/users/${userId}`).set('Authorization', auth);
    expect(own.status).toBe(200);
    expect(own.body.email).toBe('new@example.com');

    const { user: other } = await h.createUser('other@example.com');
    expect((await request(h.app).get(`/api/v1/users/${other.id}`).set('Authorization', auth)).status).toBe(403);
  });

  it('returns 409 when registering a taken email', async () => {
    const body = { email: 'dup@example.com', password: 'Secret123!' };
    expect((await request(h.app).post('/api/v1/users').send(body)).status).toBe(201);
    expect((await request(h.app).post('/api/v1/users').send(body)).status).toBe(409);
  });

  it('rejects a wrong password', async () => {
    await h.createUser('user@example.com');
    const res = await request(h.app).post('/api/v1/auth/login').send({ email: 'user@example.com', password: 'nope' });
    expect(res.status).toBe(401);
  });
});
