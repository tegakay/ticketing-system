import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app';
import { bearer, USER } from '../setup/auth';
import { makeEvent, makeOrder, uniqueViolation } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';
import { redisMock, simulateRedisOutage } from '../setup/redisMock';

const URL = '/api/v1/events/event-1/reservations';

function reserve(quantity: number, key: string | null = 'key-1') {
  const req = request(app).post(URL).set('Authorization', bearer(USER)).send({ quantity });
  return key ? req.set('Idempotency-Key', key) : req;
}

beforeEach(() => {
  prismaMock.event.findUnique.mockResolvedValue(makeEvent({ capacity: 5, tickets_reserved: 0, price: 25 }));
  prismaMock.order.findUnique.mockResolvedValue(null);
  prismaMock.order.create.mockResolvedValue(makeOrder());
});

describe('POST /events/:id/reservations', () => {
  it('requires authentication', async () => {
    const res = await request(app).post(URL).set('Idempotency-Key', 'k').send({ quantity: 1 });
    expect(res.status).toBe(401);
  });

  it('requires an Idempotency-Key header', async () => {
    const res = await reserve(1, null);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Idempotency-Key/);
  });

  it.each([0, 11])('rejects quantity %i', async (quantity) => {
    expect((await reserve(quantity)).status).toBe(400);
  });

  it('returns 400 for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await reserve(1)).status).toBe(400);
  });

  it.each(['sold_out', 'cancelled', 'completed'] as const)('returns 400 when the event is %s', async (status) => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({ status }));
    const res = await reserve(1);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Event is not open for booking' });
  });

  it('creates a pending order, holds inventory, and stores the idempotency key', async () => {
    const before = Date.now();
    const res = await reserve(2, 'key-abc');

    expect(res.status).toBe(201);
    expect(res.body.order).toBeDefined();

    const { data } = prismaMock.order.create.mock.calls[0]![0];
    expect(data).toMatchObject({
      user_id: USER.id,
      event_id: 'event-1',
      quantity: 2,
      unit_price: 25,
      total_price: 50,
      status: 'pending',
      idempotency_key: 'key-abc',
    });
    const expiresIn = (data.expires_at as Date).getTime() - before;
    expect(expiresIn).toBeGreaterThan(9.5 * 60_000);
    expect(expiresIn).toBeLessThanOrEqual(10 * 60_000 + 1_000);

    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { event_id: 'event-1' },
      data: { tickets_reserved: { increment: 2 } },
    });
    expect(await redisMock.get('inv:event-1')).toBe('3');
    expect(await redisMock.get(`hold:${data.order_id}`)).toBe('2');
  });

  it('looks up the existing order by (user, idempotency key)', async () => {
    await reserve(1, 'key-abc');
    expect(prismaMock.order.findUnique).toHaveBeenCalledWith({
      where: { user_id_idempotency_key: { user_id: USER.id, idempotency_key: 'key-abc' } },
    });
  });

  it('returns the existing order for a repeated idempotency key without reserving again', async () => {
    const existing = makeOrder({ order_id: 'order-existing' });
    prismaMock.order.findUnique.mockResolvedValue(existing);

    const res = await reserve(2, 'key-1');

    expect(res.status).toBe(200);
    expect(res.body.order.order_id).toBe('order-existing');
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(await redisMock.get('inv:event-1')).toBeNull();
  });

  it('returns 409 when sold out and writes nothing to Postgres', async () => {
    await redisMock.set('inv:event-1', 1);
    const res = await reserve(2);
    expect(res.status).toBe(409);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
    expect(await redisMock.get('inv:event-1')).toBe('1');
  });

  it('releases the Redis hold when the Postgres write fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    prismaMock.$transaction.mockRejectedValue(new Error('db down'));

    const res = await reserve(2);

    expect(res.status).toBe(500);
    expect(await redisMock.get('inv:event-1')).toBe('5');
    expect(await redisMock.keys('hold:*')).toEqual([]);
  });

  it('invalidates the cached event after booking', async () => {
    await redisMock.set('cache:event:event-1', JSON.stringify({ name: 'stale' }));
    await reserve(1);
    expect(await redisMock.get('cache:event:event-1')).toBeNull();
  });
});

describe('POST /events/:id/reservations while Redis is down', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = simulateRedisOutage();
    prismaMock.$executeRaw.mockResolvedValue(1);
  });
  afterEach(() => restore());

  it('claims stock in Postgres instead, without double-counting tickets_reserved', async () => {
    const res = await reserve(2);

    expect(res.status).toBe(201);
    expect(prismaMock.$executeRaw).toHaveBeenCalledOnce();
    expect(prismaMock.order.create).toHaveBeenCalledOnce();
    expect(prismaMock.event.update).not.toHaveBeenCalled(); // the conditional UPDATE already incremented it
    expect(await redisMock.keys('*')).toEqual([]);
  });

  it('returns 409 when Postgres reports not enough stock, and creates no order', async () => {
    prismaMock.$executeRaw.mockResolvedValue(0);
    const res = await reserve(2);
    expect(res.status).toBe(409);
    expect(prismaMock.order.create).not.toHaveBeenCalled();
  });
});

describe('POST /events/:id/reservations idempotency races', () => {
  it('answers the loser of a concurrent same-key race with the winning order and gives the units back', async () => {
    const winner = makeOrder({ order_id: 'order-winner' });
    prismaMock.order.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    prismaMock.$transaction.mockRejectedValue(uniqueViolation());

    const res = await reserve(2);

    expect(res.status).toBe(200);
    expect(res.body.order.order_id).toBe('order-winner');
    expect(await redisMock.get('inv:event-1')).toBe('5');
    expect(await redisMock.keys('hold:*')).toEqual([]);
  });
});
