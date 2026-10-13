import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/app';
import { ADMIN, bearer, USER } from '../setup/auth';
import { makeEvent, makeVenue } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';
import { redisMock } from '../setup/redisMock';

const BASE = '/api/v1/events';
const validEvent = {
  name: 'Rock Night',
  date: '2026-12-01T20:00:00Z',
  venue_id: 'venue-1',
  price: 25,
  capacity: 100,
};

beforeEach(() => {
  // listEvents logs every cache miss.
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('GET /events', () => {
  it('queries on-sale events with default paging', async () => {
    prismaMock.event.findMany.mockResolvedValue([makeEvent()]);
    prismaMock.event.count.mockResolvedValue(1);

    const res = await request(app).get(BASE);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ total: 1, page: 1, pageSize: 20 });
    expect(res.body.events).toHaveLength(1);
    expect(prismaMock.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'on_sale' }, skip: 0, take: 20, orderBy: { date: 'asc' } }),
    );
  });

  it('applies keyword, city and date filters and caps pageSize at 50', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.event.count.mockResolvedValue(0);

    await request(app).get(BASE).query({
      keyword: 'rock',
      city: 'Accra',
      startDate: '2026-11-01',
      endDate: '2026-12-31',
      page: '2',
      pageSize: '100',
    });

    const args = prismaMock.event.findMany.mock.calls[0]![0]!;
    expect(args.take).toBe(50);
    expect(args.skip).toBe(50);
    expect(args.where).toEqual({
      status: 'on_sale',
      OR: [
        { name: { contains: 'rock', mode: 'insensitive' } },
        { description: { contains: 'rock', mode: 'insensitive' } },
      ],
      venue: { city: { equals: 'Accra', mode: 'insensitive' } },
      date: { gte: new Date('2026-11-01'), lte: new Date('2026-12-31') },
    });
  });

  it('serves the second identical request from cache', async () => {
    prismaMock.event.findMany.mockResolvedValue([makeEvent()]);
    prismaMock.event.count.mockResolvedValue(1);

    const first = await request(app).get(BASE).query({ city: 'Accra' });
    const second = await request(app).get(BASE).query({ city: 'Accra' });

    expect(second.body).toEqual(first.body);
    expect(prismaMock.event.findMany).toHaveBeenCalledOnce();
  });

  it('caches different filters separately', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.event.count.mockResolvedValue(0);
    await request(app).get(BASE).query({ city: 'Accra' });
    await request(app).get(BASE).query({ city: 'Kumasi' });
    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(2);
  });

  it('re-queries after an event is created', async () => {
    prismaMock.event.findMany.mockResolvedValue([]);
    prismaMock.event.count.mockResolvedValue(0);
    prismaMock.venue.findUnique.mockResolvedValue(makeVenue());
    prismaMock.event.create.mockResolvedValue(makeEvent());

    await request(app).get(BASE);
    await request(app).post(BASE).set('Authorization', bearer(ADMIN)).send(validEvent);
    await request(app).get(BASE);

    expect(prismaMock.event.findMany).toHaveBeenCalledTimes(2);
  });
});

describe('GET /events/:id', () => {
  it('returns 404 for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await request(app).get(`${BASE}/missing`)).status).toBe(404);
  });

  it('returns the event and caches it', async () => {
    prismaMock.event.findUnique.mockResolvedValue({ ...makeEvent(), venue: makeVenue() } as never);

    const first = await request(app).get(`${BASE}/event-1`);
    const second = await request(app).get(`${BASE}/event-1`);

    expect(first.status).toBe(200);
    expect(first.body.name).toBe('Rock Night');
    expect(second.body).toEqual(first.body);
    expect(prismaMock.event.findUnique).toHaveBeenCalledOnce();
    expect(await redisMock.get('cache:event:event-1')).not.toBeNull();
  });

  it('serves a cache hit without touching the database', async () => {
    await redisMock.set('cache:event:event-1', JSON.stringify({ event_id: 'event-1', name: 'Cached' }));
    const res = await request(app).get(`${BASE}/event-1`);
    expect(res.body.name).toBe('Cached');
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });
});

describe('POST /events', () => {
  it('requires authentication', async () => {
    expect((await request(app).post(BASE).send(validEvent)).status).toBe(401);
  });

  it('is forbidden for non-admins', async () => {
    expect((await request(app).post(BASE).set('Authorization', bearer(USER)).send(validEvent)).status).toBe(403);
  });

  it('returns 400 for an invalid body', async () => {
    const res = await request(app).post(BASE).set('Authorization', bearer(ADMIN)).send({ ...validEvent, price: 0 });
    expect(res.status).toBe(400);
  });

  it('returns 404 when the venue does not exist', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(null);
    const res = await request(app).post(BASE).set('Authorization', bearer(ADMIN)).send(validEvent);
    expect(res.status).toBe(404);
    expect(prismaMock.event.create).not.toHaveBeenCalled();
  });

  it('creates the event', async () => {
    prismaMock.venue.findUnique.mockResolvedValue(makeVenue());
    prismaMock.event.create.mockResolvedValue(makeEvent());
    const res = await request(app).post(BASE).set('Authorization', bearer(ADMIN)).send(validEvent);
    expect(res.status).toBe(201);
    expect(prismaMock.event.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ name: 'Rock Night', date: new Date(validEvent.date), price: 25, capacity: 100 }),
    });
  });
});

describe('PUT /events/:id', () => {
  it('returns 404 for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    const res = await request(app).put(`${BASE}/missing`).set('Authorization', bearer(ADMIN)).send({ price: 30 });
    expect(res.status).toBe(404);
  });

  it('returns 404 when moving to an unknown venue', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent());
    prismaMock.venue.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .put(`${BASE}/event-1`)
      .set('Authorization', bearer(ADMIN))
      .send({ venue_id: 'nowhere' });
    expect(res.status).toBe(404);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });

  it('updates the event and invalidates its cache entry', async () => {
    await redisMock.set('cache:event:event-1', JSON.stringify({ name: 'Old' }));
    prismaMock.event.findUnique.mockResolvedValue(makeEvent());
    prismaMock.event.update.mockResolvedValue(makeEvent({ price: 30 }));

    const res = await request(app).put(`${BASE}/event-1`).set('Authorization', bearer(ADMIN)).send({ price: 30 });

    expect(res.status).toBe(200);
    expect(res.body.price).toBe(30);
    expect(await redisMock.get('cache:event:event-1')).toBeNull();
  });

  it('is forbidden for non-admins', async () => {
    expect((await request(app).put(`${BASE}/event-1`).set('Authorization', bearer(USER)).send({ price: 1 })).status).toBe(403);
  });
});

describe('DELETE /events/:id', () => {
  it('returns 404 for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    expect((await request(app).delete(`${BASE}/missing`).set('Authorization', bearer(ADMIN))).status).toBe(404);
  });

  it('deletes the event and invalidates its cache entry', async () => {
    await redisMock.set('cache:event:event-1', JSON.stringify({ name: 'Old' }));
    prismaMock.event.findUnique.mockResolvedValue(makeEvent());

    const res = await request(app).delete(`${BASE}/event-1`).set('Authorization', bearer(ADMIN));

    expect(res.status).toBe(204);
    expect(prismaMock.event.delete).toHaveBeenCalledWith({ where: { event_id: 'event-1' } });
    expect(await redisMock.get('cache:event:event-1')).toBeNull();
  });
});
