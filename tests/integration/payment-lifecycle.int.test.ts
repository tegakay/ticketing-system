import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestInfra, loadHarness, type Harness } from './setup/harness';

const SECRET = 'int-webhook-secret';

describe.skipIf(!hasTestInfra)('payment, cancellation and expiry against real Postgres + Redis', () => {
  let h: Harness;

  beforeAll(async () => {
    process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
    h = await loadHarness();
  });
  beforeEach(async () => {
    await h.reset();
  });
  afterAll(async () => {
    await h?.shutdown();
  });

  async function reserve(eventId: string, auth: string, quantity: number, key: string) {
    const res = await request(h.app)
      .post(`/api/v1/events/${eventId}/reservations`)
      .set('Authorization', auth)
      .set('Idempotency-Key', key)
      .send({ quantity });
    expect(res.status).toBe(201);
    return res.body.order.order_id as string;
  }

  function webhook(body: object) {
    const raw = JSON.stringify(body);
    return request(h.app)
      .post('/api/v1/webhook/payments')
      .set('Content-Type', 'application/json')
      .set('pay--signature', createHmac('sha256', SECRET).update(raw).digest('hex'))
      .send(raw);
  }

  const reserved = async (eventId: string) =>
    (await h.prisma.event.findUniqueOrThrow({ where: { event_id: eventId } })).tickets_reserved;

  it('confirms a paid order, issues its tickets once, and keeps the stock sold', async () => {
    const event = await h.createEvent(5);
    const { auth, user } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 2, 'k1');

    expect((await webhook({ order_id: orderId, payment_status: 'success' })).status).toBe(200);
    expect((await webhook({ order_id: orderId, payment_status: 'success' })).status).toBe(200); // provider retry

    expect(await h.prisma.ticket.count({ where: { order_id: orderId, user_id: user.id } })).toBe(2);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { order_id: orderId } })).status).toBe('confirmed');
    expect(await reserved(event.event_id)).toBe(2);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('3');
    expect(await h.redis.exists(`hold:${orderId}`)).toBe(0);
  });

  it('rejects an unsigned or forged webhook and leaves the order pending', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 1, 'k1');

    const forged = await request(h.app)
      .post('/api/v1/webhook/payments')
      .set('pay--signature', 'deadbeef')
      .send({ order_id: orderId, payment_status: 'success' });

    expect(forged.status).toBe(401);
    expect((await h.prisma.order.findUniqueOrThrow({ where: { order_id: orderId } })).status).toBe('pending');
  });

  it('returns tickets to both Postgres and Redis when payment fails, even if the webhook is retried', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 3, 'k1');

    expect((await webhook({ order_id: orderId, payment_status: 'Failed' })).status).toBe(200);
    expect((await webhook({ order_id: orderId, payment_status: 'Failed' })).status).toBe(200);

    expect(await reserved(event.event_id)).toBe(0);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('5');
    expect((await h.prisma.order.findUniqueOrThrow({ where: { order_id: orderId } })).status).toBe('cancelled');
  });

  it('cannot confirm an order after it was cancelled', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 1, 'k1');
    await webhook({ order_id: orderId, payment_status: 'Failed' });

    expect((await webhook({ order_id: orderId, payment_status: 'success' })).status).toBe(409);
    expect(await h.prisma.ticket.count()).toBe(0);
  });

  it('lets a customer cancel their own pending order but not mark it confirmed', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 2, 'k1');

    const cheat = await request(h.app).put(`/api/v1/orders/${orderId}`).set('Authorization', auth).send({ status: 'confirmed' });
    expect(cheat.status).toBe(403);

    const cancel = await request(h.app).put(`/api/v1/orders/${orderId}`).set('Authorization', auth).send({ status: 'cancelled' });
    expect(cancel.status).toBe(200);
    expect(await reserved(event.event_id)).toBe(0);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('5');
  });

  it('releases stock when a pending order is deleted', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 2, 'k1');

    expect((await request(h.app).delete(`/api/v1/orders/${orderId}`).set('Authorization', auth)).status).toBe(204);
    expect(await reserved(event.event_id)).toBe(0);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('5');
  });

  it('expires unpaid orders past their hold and makes the stock bookable again', async () => {
    const { expireStaleOrders } = await import('../../src/services/orderExpiry.service');
    const event = await h.createEvent(2);
    const { auth } = await h.createUser('buyer@example.com');
    const orderId = await reserve(event.event_id, auth, 2, 'k1');

    const soldOut = await request(h.app)
      .post(`/api/v1/events/${event.event_id}/reservations`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'k2')
      .send({ quantity: 1 });
    expect(soldOut.status).toBe(409);

    expect(await expireStaleOrders()).toBe(0); // hold still valid
    await h.prisma.order.update({ where: { order_id: orderId }, data: { expires_at: new Date(Date.now() - 1000) } });
    expect(await expireStaleOrders()).toBe(1);
    expect(await expireStaleOrders()).toBe(0); // idempotent

    expect((await h.prisma.order.findUniqueOrThrow({ where: { order_id: orderId } })).status).toBe('expired');
    expect(await reserved(event.event_id)).toBe(0);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('2');
    await reserve(event.event_id, auth, 2, 'k3');
  });

  it('keeps taking bookings through Postgres when the Redis counter state is lost mid-flight', async () => {
    // Redis flushed (restart without persistence): the counter re-warms from Postgres, no oversell.
    const event = await h.createEvent(3);
    const { auth } = await h.createUser('buyer@example.com');
    await reserve(event.event_id, auth, 2, 'k1');
    await h.redis.flushdb();

    await reserve(event.event_id, auth, 1, 'k2');
    const over = await request(h.app)
      .post(`/api/v1/events/${event.event_id}/reservations`)
      .set('Authorization', auth)
      .set('Idempotency-Key', 'k3')
      .send({ quantity: 1 });
    expect(over.status).toBe(409);
    expect(await reserved(event.event_id)).toBe(3);
  });

  it('deduplicates concurrent requests that share an Idempotency-Key', async () => {
    const event = await h.createEvent(10);
    const { auth } = await h.createUser('buyer@example.com');

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        request(h.app)
          .post(`/api/v1/events/${event.event_id}/reservations`)
          .set('Authorization', auth)
          .set('Idempotency-Key', 'same')
          .send({ quantity: 2 }),
      ),
    );

    expect(results.every((r) => r.status === 201 || r.status === 200)).toBe(true);
    expect(new Set(results.map((r) => r.body.order.order_id)).size).toBe(1);
    expect(await reserved(event.event_id)).toBe(2);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('8');
  });
});
