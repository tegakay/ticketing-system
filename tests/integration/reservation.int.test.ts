import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestInfra, loadHarness, type Harness } from './setup/harness';

describe.skipIf(!hasTestInfra)('reservations against real Postgres + Redis', () => {
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

  it('never oversells under concurrent requests', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');

    const responses = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        request(h.app)
          .post(`/api/v1/events/${event.event_id}/reservations`)
          .set('Authorization', auth)
          .set('Idempotency-Key', `key-${i}`)
          .send({ quantity: 1 }),
      ),
    );

    const statuses = responses.map((r) => r.status);
    expect(statuses.filter((s) => s === 201)).toHaveLength(5);
    expect(statuses.filter((s) => s === 409)).toHaveLength(5);

    const stored = await h.prisma.event.findUniqueOrThrow({ where: { event_id: event.event_id } });
    expect(stored.tickets_reserved).toBe(5);
    expect(await h.prisma.order.count({ where: { event_id: event.event_id } })).toBe(5);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('0');
  });

  it('treats a retried request with the same Idempotency-Key as the same order', async () => {
    const event = await h.createEvent(5);
    const { auth } = await h.createUser('buyer@example.com');
    const send = () =>
      request(h.app)
        .post(`/api/v1/events/${event.event_id}/reservations`)
        .set('Authorization', auth)
        .set('Idempotency-Key', 'retry-me')
        .send({ quantity: 2 });

    const first = await send();
    const second = await send();

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.order.order_id).toBe(first.body.order.order_id);
    expect(await h.prisma.order.count()).toBe(1);
    expect(await h.redis.get(`inv:${event.event_id}`)).toBe('3');
  });

  it('scopes idempotency keys per user', async () => {
    const event = await h.createEvent(5);
    const alice = await h.createUser('alice@example.com');
    const bob = await h.createUser('bob@example.com');

    for (const { auth } of [alice, bob]) {
      const res = await request(h.app)
        .post(`/api/v1/events/${event.event_id}/reservations`)
        .set('Authorization', auth)
        .set('Idempotency-Key', 'same-key')
        .send({ quantity: 1 });
      expect(res.status).toBe(201);
    }
    expect(await h.prisma.order.count()).toBe(2);
  });
});
