import { describe, expect, it } from 'vitest';
import {
  clearHold,
  ensureInventoryInitialized,
  parseHoldOrderId,
  releaseInventory,
  reserveInventory,
} from '../../../src/services/inventory.service';
import { makeEvent } from '../../setup/factories';
import { prismaMock } from '../../setup/prismaMock';
import { redisMock } from '../../setup/redisMock';

const EVENT = 'event-1';

describe('ensureInventoryInitialized', () => {
  it('seeds the counter from capacity - tickets_reserved with a TTL', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({ capacity: 100, tickets_reserved: 30 }));
    await ensureInventoryInitialized(EVENT);
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('70');
    expect(await redisMock.ttl(`inv:${EVENT}`)).toBeGreaterThan(0);
  });

  it('does not touch an existing counter', async () => {
    await redisMock.set(`inv:${EVENT}`, 5);
    await ensureInventoryInitialized(EVENT);
    expect(prismaMock.event.findUnique).not.toHaveBeenCalled();
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('5');
  });

  it('throws EVENT_NOT_FOUND for an unknown event', async () => {
    prismaMock.event.findUnique.mockResolvedValue(null);
    await expect(ensureInventoryInitialized(EVENT)).rejects.toThrow('EVENT_NOT_FOUND');
  });
});

describe('reserveInventory', () => {
  it('decrements the counter and arms a hold marker that outlives the 10-minute reservation', async () => {
    await redisMock.set(`inv:${EVENT}`, 10);
    expect(await reserveInventory(EVENT, 'order-1', 3)).toBe('RESERVED');
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('7');
    expect(await redisMock.get('hold:order-1')).toBe('3');
    const ttl = await redisMock.ttl('hold:order-1');
    expect(ttl).toBeGreaterThan(10 * 60);
    expect(ttl).toBeLessThanOrEqual(30 * 60);
  });

  it('lazily initialises a cold counter from Postgres', async () => {
    prismaMock.event.findUnique.mockResolvedValue(makeEvent({ capacity: 5, tickets_reserved: 0 }));
    expect(await reserveInventory(EVENT, 'order-1', 2)).toBe('RESERVED');
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('3');
  });

  it('returns SOLD_OUT without changing the counter or arming a hold', async () => {
    await redisMock.set(`inv:${EVENT}`, 2);
    expect(await reserveInventory(EVENT, 'order-1', 3)).toBe('SOLD_OUT');
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('2');
    expect(await redisMock.get('hold:order-1')).toBeNull();
  });

  it('allows claiming exactly the remaining inventory, then sells out', async () => {
    await redisMock.set(`inv:${EVENT}`, 3);
    expect(await reserveInventory(EVENT, 'order-1', 3)).toBe('RESERVED');
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('0');
    expect(await reserveInventory(EVENT, 'order-2', 1)).toBe('SOLD_OUT');
  });
});

describe('releaseInventory', () => {
  it('returns the quantity to the pool and clears the hold', async () => {
    await redisMock.set(`inv:${EVENT}`, 7);
    await redisMock.set('hold:order-1', 3);
    await releaseInventory(EVENT, 'order-1', 3);
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('10');
    expect(await redisMock.get('hold:order-1')).toBeNull();
  });
});

describe('clearHold', () => {
  it('removes the hold without releasing inventory', async () => {
    await redisMock.set(`inv:${EVENT}`, 7);
    await redisMock.set('hold:order-1', 3);
    await clearHold('order-1');
    expect(await redisMock.get('hold:order-1')).toBeNull();
    expect(await redisMock.get(`inv:${EVENT}`)).toBe('7');
  });
});

describe('parseHoldOrderId', () => {
  it('extracts the order id from a hold key', () => {
    expect(parseHoldOrderId('hold:abc-123')).toBe('abc-123');
  });

  it('returns null for other keys', () => {
    expect(parseHoldOrderId('inv:abc')).toBeNull();
    expect(parseHoldOrderId('hold:')).toBeNull();
  });
});
