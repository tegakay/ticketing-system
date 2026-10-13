import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';
import { ADMIN, bearer, USER } from '../setup/auth';
import { makeOrder, makeUser, uniqueViolation } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';

const BASE = '/api/v1/admin';
const adminUser = makeUser({ id: ADMIN.id, email: 'admin@example.com', role: 'ADMIN' });

describe('admin account routes', () => {
  it('require authentication', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it('are forbidden for non-admins', async () => {
    expect((await request(app).get(BASE).set('Authorization', bearer(USER))).status).toBe(403);
    expect((await request(app).post(BASE).set('Authorization', bearer(USER)).send({})).status).toBe(403);
  });

  it('GET / lists admins without passwords', async () => {
    prismaMock.user.findMany.mockResolvedValue([adminUser]);
    const res = await request(app).get(BASE).set('Authorization', bearer(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body[0]).not.toHaveProperty('password');
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ where: { role: 'ADMIN' } });
  });

  it('GET /:id returns an admin or 404', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(null);
    expect((await request(app).get(`${BASE}/${ADMIN.id}`).set('Authorization', bearer(ADMIN))).status).toBe(200);
    expect((await request(app).get(`${BASE}/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
  });

  it('POST / creates an ADMIN account', async () => {
    prismaMock.user.create.mockResolvedValue(adminUser);
    const res = await request(app)
      .post(BASE)
      .set('Authorization', bearer(ADMIN))
      .send({ email: 'admin2@example.com', password: 'Secret123!' });
    expect(res.status).toBe(201);
    expect(res.body).not.toHaveProperty('password');
    expect(prismaMock.user.create.mock.calls[0]![0].data.role).toBe('ADMIN');
  });

  it('POST / returns 409 for a duplicate email', async () => {
    prismaMock.user.create.mockRejectedValue(uniqueViolation());
    const res = await request(app)
      .post(BASE)
      .set('Authorization', bearer(ADMIN))
      .send({ email: 'taken@example.com', password: 'Secret123!' });
    expect(res.status).toBe(409);
  });

  it('PUT /:id updates an admin or returns 404', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(null);
    prismaMock.user.update.mockResolvedValue({ ...adminUser, name: 'Boss' });
    const ok = await request(app).put(`${BASE}/${ADMIN.id}`).set('Authorization', bearer(ADMIN)).send({ name: 'Boss' });
    expect(ok.status).toBe(200);
    expect(ok.body.name).toBe('Boss');
    const missing = await request(app).put(`${BASE}/missing`).set('Authorization', bearer(ADMIN)).send({ name: 'Boss' });
    expect(missing.status).toBe(404);
  });

  it('DELETE /:id deletes an admin or returns 404', async () => {
    prismaMock.user.findFirst.mockResolvedValueOnce(adminUser).mockResolvedValueOnce(null);
    expect((await request(app).delete(`${BASE}/${ADMIN.id}`).set('Authorization', bearer(ADMIN))).status).toBe(204);
    expect((await request(app).delete(`${BASE}/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
  });
});

describe('admin order routes', () => {
  it('GET /orders lists every order (not captured by /:id)', async () => {
    prismaMock.order.findMany.mockResolvedValue([makeOrder(), makeOrder({ order_id: 'order-2', user_id: 'user-2' })]);
    const res = await request(app).get(`${BASE}/orders`).set('Authorization', bearer(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(prismaMock.user.findFirst).not.toHaveBeenCalled();
  });

  it('GET /orders is forbidden for non-admins', async () => {
    expect((await request(app).get(`${BASE}/orders`).set('Authorization', bearer(USER))).status).toBe(403);
  });

  it('GET /orders/:id returns a single order', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    const res = await request(app).get(`${BASE}/orders/order-1`).set('Authorization', bearer(ADMIN));
    expect(res.status).toBe(200);
    expect(res.body.order_id).toBe('order-1');
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({ where: { order_id: 'order-1' } });
  });

  it('GET /orders/:id returns 404 for an unknown order', async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/orders/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
  });

  it('PUT /orders/:id updates any order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ user_id: 'someone' }));
    prismaMock.order.update.mockResolvedValue(makeOrder({ status: 'confirmed' }));
    const res = await request(app)
      .put(`${BASE}/orders/order-1`)
      .set('Authorization', bearer(ADMIN))
      .send({ status: 'confirmed' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(prismaMock.order.update).toHaveBeenCalledWith({
      where: { order_id: 'order-1' },
      data: expect.objectContaining({ status: 'confirmed' }),
    });
  });

  it('PUT /orders/:id returns 404 for an unknown order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put(`${BASE}/orders/missing`)
      .set('Authorization', bearer(ADMIN))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(404);
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('PUT /orders/:id rejects an invalid status', async () => {
    const res = await request(app)
      .put(`${BASE}/orders/order-1`)
      .set('Authorization', bearer(ADMIN))
      .send({ status: 'completed' });
    expect(res.status).toBe(400);
  });

  it('DELETE /orders/:id deletes or returns 404', async () => {
    prismaMock.order.findUnique
      .mockResolvedValueOnce(makeOrder({ status: 'cancelled' }))
      .mockResolvedValueOnce(null);
    expect((await request(app).delete(`${BASE}/orders/order-1`).set('Authorization', bearer(ADMIN))).status).toBe(204);
    expect((await request(app).delete(`${BASE}/orders/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
    expect(prismaMock.order.delete).toHaveBeenCalledOnce();
  });
});
