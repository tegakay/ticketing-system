import request from 'supertest';
import { describe, expect, it } from 'vitest';
import app from '../../src/app';
import { bearer, OTHER_USER, USER } from '../setup/auth';
import { makeOrder } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';

const BASE = '/api/v1/orders';

describe('GET /orders', () => {
  it('requires authentication', async () => {
    expect((await request(app).get(BASE)).status).toBe(401);
  });

  it("returns only the caller's orders", async () => {
    prismaMock.order.findMany.mockResolvedValue([makeOrder()]);
    const res = await request(app).get(BASE).set('Authorization', bearer(USER));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(prismaMock.order.findMany).toHaveBeenCalledWith({ where: { user_id: USER.id } });
  });
});

describe('GET /orders/:id', () => {
  it('returns an order scoped to the caller', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    const res = await request(app).get(`${BASE}/order-1`).set('Authorization', bearer(USER));
    expect(res.status).toBe(200);
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({ where: { order_id: 'order-1', user_id: USER.id } });
  });

  it("returns 404 for someone else's order", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/order-1`).set('Authorization', bearer(OTHER_USER))).status).toBe(404);
  });

  it('requires authentication', async () => {
    expect((await request(app).get(`${BASE}/order-1`)).status).toBe(401);
  });
});

describe('PUT /orders/:id', () => {
  it('lets the owner cancel a pending order and returns its tickets to the pool', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ status: 'cancelled' }));
    const res = await request(app).put(`${BASE}/order-1`).set('Authorization', bearer(USER)).send({ status: 'cancelled' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelled');
    expect(prismaMock.order.findFirst).toHaveBeenCalledWith({ where: { order_id: 'order-1', user_id: USER.id } });
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { order_id: 'order-1', status: 'pending' },
      data: { status: 'cancelled' },
    });
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { event_id: 'event-1' },
      data: { tickets_reserved: { decrement: 2 } },
    });
  });

  it.each([
    ['confirming their own order', { status: 'confirmed' }],
    ['attaching a payment id', { payment_id: 'pay_1', status: 'cancelled' }],
    ['changing the quantity', { quantity: 1 }],
    ['moving it to another event', { event_id: 'event-9' }],
  ])('forbids a customer %s', async (_name, body) => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    const res = await request(app).put(`${BASE}/order-1`).set('Authorization', bearer(USER)).send(body);
    expect(res.status).toBe(403);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.order.update).not.toHaveBeenCalled();
  });

  it('returns 409 when the order is no longer pending', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder({ status: 'confirmed' }));
    const res = await request(app).put(`${BASE}/order-1`).set('Authorization', bearer(USER)).send({ status: 'cancelled' });
    expect(res.status).toBe(409);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it('does not release tickets twice when a concurrent request already cancelled it', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await request(app).put(`${BASE}/order-1`).set('Authorization', bearer(USER)).send({ status: 'cancelled' });
    expect(res.status).toBe(409);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it("returns 404 and does not update someone else's order", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    const res = await request(app)
      .put(`${BASE}/order-1`)
      .set('Authorization', bearer(OTHER_USER))
      .send({ status: 'cancelled' });
    expect(res.status).toBe(404);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
  });

  it('rejects an empty body', async () => {
    expect((await request(app).put(`${BASE}/order-1`).set('Authorization', bearer(USER)).send({})).status).toBe(400);
  });
});

describe('DELETE /orders/:id', () => {
  it('deletes an own pending order and returns its tickets to the pool', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder());
    expect((await request(app).delete(`${BASE}/order-1`).set('Authorization', bearer(USER))).status).toBe(204);
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { event_id: 'event-1' },
      data: { tickets_reserved: { decrement: 2 } },
    });
    expect(prismaMock.order.delete).toHaveBeenCalledWith({ where: { order_id: 'order-1' } });
  });

  it('deletes a cancelled order without touching inventory', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder({ status: 'cancelled' }));
    expect((await request(app).delete(`${BASE}/order-1`).set('Authorization', bearer(USER))).status).toBe(204);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it('refuses to delete a confirmed order that has issued tickets', async () => {
    prismaMock.order.findFirst.mockResolvedValue(makeOrder({ status: 'confirmed' }));
    expect((await request(app).delete(`${BASE}/order-1`).set('Authorization', bearer(USER))).status).toBe(409);
    expect(prismaMock.order.delete).not.toHaveBeenCalled();
  });

  it("returns 404 and does not delete someone else's order", async () => {
    prismaMock.order.findFirst.mockResolvedValue(null);
    expect((await request(app).delete(`${BASE}/order-1`).set('Authorization', bearer(OTHER_USER))).status).toBe(404);
    expect(prismaMock.order.delete).not.toHaveBeenCalled();
  });
});
