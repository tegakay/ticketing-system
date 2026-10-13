import type { Prisma } from '@prisma/client';
import { redis } from '../lib/redis.js';
import { isRedisUp } from '../lib/redisSafe.js';
import { prisma } from '../lib/prisma.js';

/**
 * The hold key is a marker that "this order's units were taken from the Redis
 * counter". It outlives the order's 10-minute reservation window so the expiry
 * sweeper (orderExpiry.service.ts) can still find it when it releases the units.
 */
const HOLD_TTL_SECONDS = 30 * 60;

const inventoryKey = (eventId: string) => `inv:${eventId}`;
const holdKey = (orderId: string) => `hold:${orderId}`;

/**
 * Atomically: check available >= quantity, then decrement. One round trip,
 * no race window between the check and the write, which is what a plain
 * Prisma `update({ data: { decrement } })` can't give you on its own.
 *
 * Returns 1 on success, 0 if not enough inventory, -1 if the counter is missing.
 */
const RESERVE_SCRIPT = `
local available = tonumber(redis.call('GET', KEYS[1]))
if available == nil then
  return -1 -- signal: cache not warmed, caller should init and retry
end
local qty = tonumber(ARGV[1])
if available < qty then
  return 0
end
redis.call('DECRBY', KEYS[1], qty)
return 1
`;

// Only credit a counter that exists: INCRBY on a missing key would create it
// holding just the released quantity, and a bogus "3 left" would then be
// trusted instead of being re-warmed from Postgres.
const RELEASE_SCRIPT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('INCRBY', KEYS[1], ARGV[1])
end
return 1
`;

// Release only if the hold marker is still there, deleting it in the same step,
// so a unit can never be returned twice (e.g. sweeper racing a cancellation).
const RELEASE_HELD_SCRIPT = `
if redis.call('DEL', KEYS[2]) == 1 and redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('INCRBY', KEYS[1], ARGV[1])
end
return 1
`;

/**
 * Lazily warms the Redis counter from Postgres the first time an event is
 * touched. NX means only the first caller in a race actually sets it; later
 * callers just no-op, so this is safe under concurrent cold-cache requests.
 */
export async function ensureInventoryInitialized(eventId: string): Promise<void> {
  const key = inventoryKey(eventId);
  const exists = await redis.exists(key);
  if (exists) return;

  const event = await prisma.event.findUnique({ where: { event_id: eventId } });
  if (!event) throw new Error('EVENT_NOT_FOUND');

  const available = event.capacity - event.tickets_reserved;
  await redis.set(key, available, 'EX', 60 * 60 * 6, 'NX'); // 6h cache lifetime, NX = don't clobber a concurrent init
}

/** Drops the Redis counter so it is re-warmed from Postgres (e.g. after a capacity change). */
export async function resetInventory(eventId: string): Promise<void> {
  if (!isRedisUp()) return;
  try {
    await redis.del(inventoryKey(eventId));
  } catch {
    // Redis down: nothing to reset, it is purged on reconnect.
  }
}

/**
 * RESERVED / SOLD_OUT: decided by Redis. UNAVAILABLE: Redis could not be
 * used, and the caller must claim the stock in Postgres instead
 * (see claimInventoryInDb).
 */
export type ReserveResult = 'RESERVED' | 'SOLD_OUT' | 'UNAVAILABLE';

/**
 * Attempts to atomically claim `quantity` units of inventory for an event.
 * On success, also sets a TTL "hold" marker keyed by orderId (see HOLD_TTL_SECONDS).
 */
export async function reserveInventory(
  eventId: string,
  orderId: string,
  quantity: number,
): Promise<ReserveResult> {
  if (!isRedisUp()) return 'UNAVAILABLE';

  try {
    // The counter can expire/evict between init and eval (-1); re-warm and retry a few times.
    for (let attempt = 0; attempt < 3; attempt++) {
      await ensureInventoryInitialized(eventId);
      const result = await redis.eval(RESERVE_SCRIPT, 1, inventoryKey(eventId), quantity);
      if (result === -1) continue;
      if (result === 0) return 'SOLD_OUT';

      await redis.set(holdKey(orderId), quantity, 'EX', HOLD_TTL_SECONDS);
      return 'RESERVED';
    }
    return 'UNAVAILABLE';
  } catch (err) {
    if (err instanceof Error && err.message === 'EVENT_NOT_FOUND') throw err;
    console.error('[inventory] Redis reservation failed, using Postgres fallback:', (err as Error).message);
    return 'UNAVAILABLE';
  }
}

/**
 * Postgres-only equivalent of the Redis claim, used when Redis is down. The
 * conditional UPDATE is atomic, so it cannot oversell; it also increments
 * tickets_reserved itself, so callers must not increment it again.
 * Returns false when there is not enough stock.
 */
export async function claimInventoryInDb(
  tx: Prisma.TransactionClient,
  eventId: string,
  quantity: number,
): Promise<boolean> {
  const claimed = await tx.$executeRaw`
    UPDATE "Event"
    SET tickets_reserved = tickets_reserved + ${quantity}
    WHERE event_id = ${eventId}
      AND status = 'on_sale'
      AND (capacity - tickets_reserved) >= ${quantity}
  `;
  return claimed > 0;
}

/** Releases held inventory back to the pool and clears the hold marker (idempotent). Best effort. */
export async function releaseInventory(eventId: string, orderId: string, quantity: number): Promise<void> {
  if (!isRedisUp()) return;
  try {
    await redis.eval(RELEASE_SCRIPT, 1, inventoryKey(eventId), quantity);
    await redis.del(holdKey(orderId));
  } catch {
    // Redis down: counters are rebuilt from Postgres on reconnect.
  }
}

/**
 * Returns an order's units to the Redis counter only if that order actually
 * took them from Redis (its hold marker exists). Orders reserved through the
 * Postgres fallback have no marker and are skipped. Best effort.
 */
export async function releaseHeldInventory(eventId: string, orderId: string, quantity: number): Promise<void> {
  if (!isRedisUp()) return;
  try {
    await redis.eval(RELEASE_HELD_SCRIPT, 2, inventoryKey(eventId), holdKey(orderId), quantity);
  } catch {
    // Redis down: counters are rebuilt from Postgres on reconnect.
  }
}

/**
 * Called when an order is confirmed (payment succeeded). The ticket is
 * permanently sold, so we do NOT release inventory; we just remove the hold
 * marker so a later cancel/expiry can't accidentally release sold inventory.
 */
export async function clearHold(orderId: string): Promise<void> {
  if (!isRedisUp()) return;
  try {
    await redis.del(holdKey(orderId));
  } catch {
    // best effort
  }
}

export function parseHoldOrderId(expiredKey: string): string | null {
  const match = expiredKey.match(/^hold:(.+)$/);
  return match ? match[1]! : null;
}
