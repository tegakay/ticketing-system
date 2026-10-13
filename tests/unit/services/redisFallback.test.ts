import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getCachedEvent,
  getCachedEventList,
  invalidateEvent,
  invalidateEventList,
  setCachedEvent,
  setCachedEventList,
} from '../../../src/services/eventCache.service';
import {
  clearHold,
  releaseHeldInventory,
  releaseInventory,
  reserveInventory,
  resetInventory,
} from '../../../src/services/inventory.service';
import { makeEvent } from '../../setup/factories';
import { prismaMock } from '../../setup/prismaMock';
import { redisMock, simulateRedisOutage } from '../../setup/redisMock';

let restore: () => void;
beforeEach(() => {
  restore = simulateRedisOutage();
});
afterEach(() => {
  restore();
  vi.restoreAllMocks();
});

describe('event cache while Redis is down', () => {
  it('behaves as a permanent miss and never throws', async () => {
    await expect(setCachedEvent('e1', { a: 1 })).resolves.toBeUndefined();
    await expect(getCachedEvent('e1')).resolves.toBeNull();
    await expect(setCachedEventList('v', { a: 1 })).resolves.toBeUndefined();
    await expect(getCachedEventList('v')).resolves.toBeNull();
    await expect(invalidateEvent('e1')).resolves.toBeUndefined();
    await expect(invalidateEventList()).resolves.toBeUndefined();
  });

  it('degrades the same way when a command is attempted and fails', async () => {
    restore(); // looks healthy, but commands blow up (e.g. command timeout)
    vi.spyOn(redisMock, 'get').mockRejectedValue(new Error('Command timed out'));
    await expect(getCachedEvent('e1')).resolves.toBeNull();
    await expect(getCachedEventList('v')).resolves.toBeNull();
  });

  it('treats a corrupt cached value as a miss', async () => {
    restore();
    await redisMock.set('cache:event:e1', '{not json');
    await expect(getCachedEvent('e1')).resolves.toBeNull();
  });
});

describe('inventory while Redis is down', () => {
  it('reports UNAVAILABLE so the caller can fall back to Postgres', async () => {
    expect(await reserveInventory('e1', 'o1', 1)).toBe('UNAVAILABLE');
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
  });

  it('reports UNAVAILABLE when a Redis command fails mid-reservation', async () => {
    restore();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(redisMock, 'eval').mockRejectedValue(new Error('Connection is closed.'));
    prismaMock.event.findUnique.mockResolvedValue(makeEvent());
    expect(await reserveInventory('e1', 'o1', 1)).toBe('UNAVAILABLE');
  });

  it('still surfaces an unknown event instead of masking it as an outage', async () => {
    restore();
    prismaMock.event.findUnique.mockResolvedValue(null);
    await expect(reserveInventory('e1', 'o1', 1)).rejects.toThrow('EVENT_NOT_FOUND');
  });

  it('makes release / clear / reset best-effort no-ops', async () => {
    await expect(releaseInventory('e1', 'o1', 1)).resolves.toBeUndefined();
    await expect(releaseHeldInventory('e1', 'o1', 1)).resolves.toBeUndefined();
    await expect(clearHold('o1')).resolves.toBeUndefined();
    await expect(resetInventory('e1')).resolves.toBeUndefined();
  });
});

describe('release semantics', () => {
  beforeEach(() => restore());

  it('releaseInventory does not resurrect an expired counter', async () => {
    await releaseInventory('e1', 'o1', 3);
    expect(await redisMock.get('inv:e1')).toBeNull();
  });

  it('releaseHeldInventory credits the counter once, and only for orders that hold Redis units', async () => {
    await redisMock.set('inv:e1', 5);
    await redisMock.set('hold:o1', 2);

    await releaseHeldInventory('e1', 'o1', 2);
    await releaseHeldInventory('e1', 'o1', 2); // replay: marker already gone
    await releaseHeldInventory('e1', 'fallback-order', 2); // never took units from Redis

    expect(await redisMock.get('inv:e1')).toBe('7');
    expect(await redisMock.get('hold:o1')).toBeNull();
  });
});
