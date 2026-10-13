import { describe, expect, it } from 'vitest';
import {
  getCachedEvent,
  getCachedEventList,
  invalidateEvent,
  invalidateEventList,
  setCachedEvent,
  setCachedEventList,
} from '../../../src/services/eventCache.service';
import { redisMock } from '../../setup/redisMock';

describe('event detail cache', () => {
  it('misses when nothing is cached', async () => {
    expect(await getCachedEvent('event-1')).toBeNull();
  });

  it('round-trips a cached event with a 60s TTL', async () => {
    await setCachedEvent('event-1', { name: 'Rock Night' });
    expect(await getCachedEvent('event-1')).toEqual({ name: 'Rock Night' });
    const ttl = await redisMock.ttl('cache:event:event-1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('invalidates a single event', async () => {
    await setCachedEvent('event-1', { name: 'Rock Night' });
    await invalidateEvent('event-1');
    expect(await getCachedEvent('event-1')).toBeNull();
  });
});

describe('event list cache', () => {
  it('round-trips a list per variant', async () => {
    await setCachedEventList('a', { events: [1] });
    await setCachedEventList('b', { events: [2] });
    expect(await getCachedEventList('a')).toEqual({ events: [1] });
    expect(await getCachedEventList('b')).toEqual({ events: [2] });
    expect(await getCachedEventList('c')).toBeNull();
  });

  it('invalidates every variant by bumping the version', async () => {
    await setCachedEventList('a', { events: [1] });
    await setCachedEventList('b', { events: [2] });
    await invalidateEventList();
    expect(await getCachedEventList('a')).toBeNull();
    expect(await getCachedEventList('b')).toBeNull();
  });

  it('caches under the new version after invalidation', async () => {
    await invalidateEventList();
    await setCachedEventList('a', { events: [3] });
    expect(await getCachedEventList('a')).toEqual({ events: [3] });
  });
});
