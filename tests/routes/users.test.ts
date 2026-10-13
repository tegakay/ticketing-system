import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';
import { ADMIN, bearer, OTHER_USER, USER } from '../setup/auth';
import { makeUser, uniqueViolation } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';

const BASE = '/api/v1/users';

describe('POST /users (register)', () => {
  it('creates a USER with a hashed password and never returns it', async () => {
    prismaMock.user.create.mockResolvedValue(makeUser({ email: 'new@example.com' }));

    const res = await request(app).post(BASE).send({ email: 'new@example.com', password: 'Secret123!', name: 'New' });

    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('password');
    expect(res.body.email).toBe('new@example.com');
    const data = prismaMock.user.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({ email: 'new@example.com', name: 'New', role: 'USER' });
    expect(data.password).not.toBe('Secret123!');
  });

  it('ignores a role sent in the body', async () => {
    prismaMock.user.create.mockResolvedValue(makeUser());
    await request(app).post(BASE).send({ email: 'new@example.com', password: 'Secret123!', role: 'ADMIN' });
    expect(prismaMock.user.create.mock.calls[0]![0].data.role).toBe('USER');
  });

  it('returns 400 for a short password', async () => {
    const res = await request(app).post(BASE).send({ email: 'new@example.com', password: 'short' });
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it('returns 409 for a duplicate email', async () => {
    prismaMock.user.create.mockRejectedValue(uniqueViolation());
    const res = await request(app).post(BASE).send({ email: 'taken@example.com', password: 'Secret123!' });
    expect(res.status).toBe(409);
  });
});

describe('GET /users', () => {
  it('requires authentication', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it('is forbidden for non-admins', async () => {
    expect((await request(app).get(BASE).set('Authorization', bearer(USER))).status).toBe(403);
  });

  it('lists USER accounts without passwords for admins', async () => {
    prismaMock.user.findMany.mockResolvedValue([makeUser(), makeUser({ id: 'user-2', email: 'two@example.com' })]);
    const res = await request(app).get(BASE).set('Authorization', bearer(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body[0]).not.toHaveProperty('password');
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { role: 'USER' } });
  });
});

describe('GET /users/:id', () => {
  it('lets a user read their own profile', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUser());
    const res = await request(app).get(`${BASE}/${USER.id}`).set('Authorization', bearer(USER));
    expect(res.status).toBe(200);
    expect(res.body).not.toHaveProperty('password');
  });

  it("forbids reading another user's profile", async () => {
    const res = await request(app).get(`${BASE}/${USER.id}`).set('Authorization', bearer(OTHER_USER));
    expect(res.status).toBe(403);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('lets an admin read any user', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUser());
    expect((await request(app).get(`${BASE}/${USER.id}`).set('Authorization', bearer(ADMIN))).status).toBe(200);
  });

  it('returns 404 when the user does not exist', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
  });
});

describe('PUT /users/:id', () => {
  it('updates own profile and re-hashes a new password', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUser());
    prismaMock.user.update.mockResolvedValue(makeUser({ name: 'Renamed' }));

    const res = await request(app)
      .put(`${BASE}/${USER.id}`)
      .set('Authorization', bearer(USER))
      .send({ name: 'Renamed', password: 'NewSecret123!' });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Renamed');
    const { data } = prismaMock.user.update.mock.calls[0]![0];
    expect(data.name).toBe('Renamed');
    expect(data.password).toEqual(expect.any(String));
    expect(data.password).not.toBe('NewSecret123!');
  });

  it('returns 400 for an empty body', async () => {
    const res = await request(app).put(`${BASE}/${USER.id}`).set('Authorization', bearer(USER)).send({});
    expect(res.status).toBe(400);
  });

  it("forbids updating another user's profile", async () => {
    const res = await request(app).put(`${BASE}/${USER.id}`).set('Authorization', bearer(OTHER_USER)).send({ name: 'X' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when the user does not exist', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    const res = await request(app).put(`${BASE}/missing`).set('Authorization', bearer(ADMIN)).send({ name: 'X' });
    expect(res.status).toBe(404);
  });

  it('returns 409 when changing to an email that is taken', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUser());
    prismaMock.user.update.mockRejectedValue(uniqueViolation());
    const res = await request(app)
      .put(`${BASE}/${USER.id}`)
      .set('Authorization', bearer(USER))
      .send({ email: 'taken@example.com' });
    expect(res.status).toBe(409);
  });
});

describe('DELETE /users/:id', () => {
  it('deletes own account', async () => {
    prismaMock.user.findFirst.mockResolvedValue(makeUser());
    const res = await request(app).delete(`${BASE}/${USER.id}`).set('Authorization', bearer(USER));
    expect(res.status).toBe(204);
    expect(prismaMock.user.delete).toHaveBeenCalledWith({ where: { id: USER.id } });
  });

  it("forbids deleting another user's account", async () => {
    const res = await request(app).delete(`${BASE}/${USER.id}`).set('Authorization', bearer(OTHER_USER));
    expect(res.status).toBe(403);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it('returns 404 when the user does not exist', async () => {
    prismaMock.user.findFirst.mockResolvedValue(null);
    expect((await request(app).delete(`${BASE}/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
  });
});
