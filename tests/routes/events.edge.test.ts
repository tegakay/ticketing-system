import { Prisma } from '@prisma/client';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { ADMIN, bearer } from '../setup/auth';
import { makeEvent, makeVenue } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';
import { redisMock, simulateRedisOutage } from '../setup/redisMock';

const BASE = '/api/v1/events';

describe('GET /events input handling', () => {
  beforeEach(() => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.event.count.mockResolvedValue(0);
  });

  it.each([
    ['page=0', 'page=0', 0],
    ['a negative page', 'page=-3', 0],
    ['a non-numeric page', 'page=abc', 0],
  ])('falls back to page 1 for %s instead of crashing Prisma', async (_n, qs, skip) => {
    const res = await request(app).get(`${BASE}?${qs}`);
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip }));
  });

  it.each(['pageSize=0', 'pageSize=-5', 'pageSize=lots'])('uses the default page size for %s', async (qs) => {
    const res = await request(app).get(`${BASE}?${qs}`);
    expect(res.status).toBe(200);
    expect(res.body.pageSize).toBe(20);
  });

  it('caps the page size at 50', async () => {
    expect((await request(app).get(`${BASE}?pageSize=500`)).body.pageSize).toBe(50);
  });

  it('rejects an unparseable date filter with 400', async () => {
    expect((await request(app).get(`${BASE}?startDate=yesterdayish`)).status).toBe(400);
    expect(prismaMock.event.findMany).not.toHaveBeenCalled();
  });

  it('gives different pages their own cache entries', async () => {
    await request(app).get(`${BASE}?page=1`);
    await request(app).get(`${BASE}?page=2`);
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('PUT /events/:id capacity', () => {
  it('refuses to shrink capacity below the tickets already reserved', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({ capacity: 100, tickets_reserved: 40 }));
    const res = await request(app)
      .put(`${BASE}/event-1`)
      .set('Authorization', bearer(ADMIN))
      .send({ capacity: 30 });
    expect(res.status).toBe(409);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it('drops the Redis stock counter so it re-warms from the new capacity', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({ capacity: 100, tickets_reserved: 40 }));
    prismaMock.event.update.mockResolvedValue(makeEvent({ capacity: 200, tickets_reserved: 40 }));
    await redisMock.set('inv:event-1', 60);

    const res = await request(app)
      .put(`${BASE}/event-1`)
      .set('Authorization', bearer(ADMIN))
      .send({ capacity: 200 });

    expect(res.status).toBe(200);
    expect(await redisMock.get('inv:event-1')).toBeNull();
  });

  it('leaves the counter alone when capacity is unchanged', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({ capacity: 100 }));
    prismaMock.event.update.mockResolvedValue(makeEvent({ name: 'Renamed' }));
    await redisMock.set('inv:event-1', 60);

    await request(app).put(`${BASE}/event-1`).set('Authorization', bearer(ADMIN)).send({ name: 'Renamed' });

    expect(await redisMock.get('inv:event-1')).toBe('60');
  });
});

describe('DELETE /events/:id', () => {
  it('returns 409 instead of a 500 when orders still reference the event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent());
    prismaMock.event.delete.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Foreign key constraint failed', { code: 'P2003', clientVersion: 'test' }),
    );
    const res = await request(app).delete(`${BASE}/event-1`).set('Authorization', bearer(ADMIN));
    expect(res.status).toBe(409);
  });
});

describe('event reads while Redis is down', () => {
  let restore: () => void;
  beforeEach(() => {
    restore = simulateRedisOutage();
  });
  afterEach(() => restore());

  it('serves GET /events/:id straight from Postgres', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...makeEvent(), venue: makeVenue() } as never);
    const first = await request(app).get(`${BASE}/event-1`);
    const second = await request(app).get(`${BASE}/event-1`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(prismaMock.event.findUnique).toHaveBeenCalledTimes(2);
  });

  it('serves GET /events straight from Postgres', async () => {
    prismaMock.event.findMany.mockResolvedValue([makeEvent()]);
    prismaMock.event.count.mockResolvedValue(1);
    const res = await request(app).get(BASE);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
  });

  it('still lets admins write events', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(makeVenue());
    prismaMock.event.create.mockResolvedValue(makeEvent());
    const res = await request(app)
      .post(BASE)
      .set('Authorization', bearer(ADMIN))
      .send({ name: 'Rock Night', date: '2026-12-01T20:00:00Z', venue_id: 'venue-1', price: 25, capacity: 100 });
    expect(res.status).toBe(201);
  });
});
