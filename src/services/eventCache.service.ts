import { redis } from '../lib/redis.js';

/**
 * Cache-aside caching for the two hottest reads in the app: the event list
 * and a single event detail page. Deliberately simple — short TTL as the
 * safety net, explicit invalidation on writes for freshness, no cache
 * stampede protection or write-through. That's a fine tradeoff at this
 * scale; see the README's "Future Work" note on where this breaks down.
 */

const EVENT_TTL_SECONDS = 60; // single event detail — changes rarely, read constantly
const LIST_TTL_SECONDS = 30; // event list — shorter TTL since availability shifts faster here

const eventKey = (eventId: string) => `cache:event:${eventId}`;
const listVersionKey = 'cache:events:list:version';
// const listKey = (version: string) => `cache:events:list:v${version}`;
const listKey = (version: string, variant: string) => `cache:events:list:v${version}:${variant}`;

export async function getCachedEvent<T>(eventId: string): Promise<T | null> {
  const raw = await redis.get(eventKey(eventId));
  return raw ? (JSON.parse(raw) as T) : null;
}

export async function setCachedEvent(eventId: string, event: unknown): Promise<void> {
  await redis.set(eventKey(eventId), JSON.stringify(event), 'EX', EVENT_TTL_SECONDS);
}

/** Called on update/delete so a stale event is never served after a write. */
export async function invalidateEvent(eventId: string): Promise<void> {
  await redis.del(eventKey(eventId));
}

// export async function getCachedEventList<T>(): Promise<T | null> {
//   const version = (await redis.get(listVersionKey)) ?? '0';
//   const raw = await redis.get(listKey(version));
//   return raw ? (JSON.parse(raw) as T) : null;
// }

 export async function getCachedEventList<T>(variant: string): Promise<T | null> {
    const version = (await redis.get(listVersionKey)) ?? '0';

   const raw = await redis.get(listKey(version, variant));
    return raw ? (JSON.parse(raw) as T) : null;
  }


export async function setCachedEventList(variant: string, events: unknown): Promise<void> {
    const version = (await redis.get(listVersionKey)) ?? '0';

  await redis.set(listKey(version, variant), JSON.stringify(events), 'EX', LIST_TTL_SECONDS);
  }

// export async function setCachedEventList(events: unknown): Promise<void> {
//   const version = (await redis.get(listVersionKey)) ?? '0';
//   await redis.set(listKey(version), JSON.stringify(events), 'EX', LIST_TTL_SECONDS);
// }

// + * variant (one per keyword/city/date/page combination): old entries just
// + * become unreachable under the old version number and expire naturally via
// + * their TTL, instead of needing to enumerate and delete every variant key
// + * on every write.
export async function invalidateEventList(): Promise<void> {
  await redis.incr(listVersionKey);
}
