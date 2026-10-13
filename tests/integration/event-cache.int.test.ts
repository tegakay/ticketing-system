import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { hasTestInfra, loadHarness, type Harness } from './setup/harness';

describe.skipIf(!hasTestInfra)('event caching against real Postgres + Redis', () => {
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

  it('caches an event on read and never serves it stale after an admin update', async () => {
    const { auth } = await h.createUser('admin@example.com', 'ADMIN');
    const event = await h.createEvent(100);

    const first = await request(h.app).get(`/api/v1/events/${event.event_id}`);
    expect(first.status).toBe(200);
    expect(await h.redis.get(`cache:event:${event.event_id}`)).not.toBeNull();

    const update = await request(h.app)
      .put(`/api/v1/events/${event.event_id}`)
      .set('Authorization', auth)
      .send({ name: 'Jazz Night' });
    expect(update.status).toBe(200);

    const after = await request(h.app).get(`/api/v1/events/${event.event_id}`);
    expect(after.body.name).toBe('Jazz Night');
  });

  it('shows a newly created event in the list even after the list was cached', async () => {
    const { auth } = await h.createUser('admin@example.com', 'ADMIN');
    const event = await h.createEvent(100);

    const before = await request(h.app).get('/api/v1/events');
    expect(before.body.total).toBe(1);

    const created = await request(h.app)
      .post('/api/v1/events')
      .set('Authorization', auth)
      .send({ name: 'Second Show', date: '2026-12-02T20:00:00Z', venue_id: event.venue_id, price: 10, capacity: 50 });
    expect(created.status).toBe(201);

    const after = await request(h.app).get('/api/v1/events');
    expect(after.body.total).toBe(2);
  });
});
