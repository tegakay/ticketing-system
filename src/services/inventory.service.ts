import { redis } from '../lib/redis.js';
import { prisma } from '../lib/prisma.js';

const HOLD_TTL_SECONDS = 10 * 60; // must match the order's reservation-hold window

const inventoryKey = (eventId: string) => `inv:${eventId}`;
const holdKey = (orderId: string) => `hold:${orderId}`;

/**
 * Atomically: check available >= quantity, then decrement. One round trip,
 * no race window between the check and the write — this is what a plain
 * Prisma `update({ data: { decrement } })` can't give you on its own.
 *
 * Returns 1 on success, 0 if not enough inventory.
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

const RELEASE_SCRIPT = `
redis.call('INCRBY', KEYS[1], ARGV[1])
return 1
`;

/**
 * Lazily warms the Redis counter from Postgres the first time an event is
 * touched. NX means only the first caller in a race actually sets it — later
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

export type ReserveResult = 'RESERVED' | 'SOLD_OUT';

/**
 * Attempts to atomically claim `quantity` units of inventory for an event.
 * On success, also sets a TTL "hold" marker keyed by orderId — when that key
 * expires in Redis, a keyspace-notification listener (see holdExpiry.listener.ts)
 * releases the inventory back automatically. No cron sweep needed.
 */
export async function reserveInventory(
  eventId: string,
  orderId: string,
  quantity: number,
): Promise<ReserveResult> {
  await ensureInventoryInitialized(eventId);

  const result = await redis.eval(RESERVE_SCRIPT, 1, inventoryKey(eventId), quantity);

  if (result === -1) {
    // Rare: cache expired/evicted between ensureInventoryInitialized and eval. Re-init and retry once.
    await ensureInventoryInitialized(eventId);
    return reserveInventory(eventId, orderId, quantity);
  }
  if (result === 0) return 'SOLD_OUT';

  // Success — arm the auto-expiring hold. If this order isn't confirmed or
  // explicitly cancelled within HOLD_TTL_SECONDS, the listener releases it.
  await redis.set(holdKey(orderId), quantity, 'EX', HOLD_TTL_SECONDS);
  return 'RESERVED';
}

/** Releases held inventory back to the pool and clears the hold marker (idempotent). */
export async function releaseInventory(eventId: string, orderId: string, quantity: number): Promise<void> {
  await redis.eval(RELEASE_SCRIPT, 1, inventoryKey(eventId), quantity);
  await redis.del(holdKey(orderId));
}

/**
 * Called when an order is confirmed (payment succeeded). The ticket is
 * permanently sold, so we do NOT release inventory — we just disarm the
 * hold's TTL so its later expiry can't accidentally release sold inventory.
 */
export async function clearHold(orderId: string): Promise<void> {
  await redis.del(holdKey(orderId));
}

export function parseHoldOrderId(expiredKey: string): string | null {
  const match = expiredKey.match(/^hold:(.+)$/);
  return match ? match[1]! : null;
}
