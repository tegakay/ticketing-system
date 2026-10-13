import { redis } from '../lib/redis.js';
import { safely } from '../lib/redisSafe.js';

/**
 * Cache-aside caching for the two hottest reads in the app: the event list
 * and a single event detail page. Deliberately simple: short TTL as the
 * safety net, explicit invalidation on writes for freshness, no cache
 * stampede protection or write-through.
 *
 * Every function degrades gracefully: if Redis is unreachable, reads behave
 * as a cache miss and writes/invalidations become no-ops, so requests are
 * served straight from Postgres.
 */

const EVENT_TTL_SECONDS = 60; // single event detail: changes rarely, read constantly
const LIST_TTL_SECONDS = 30; // event list: shorter TTL since availability shifts faster here

const eventKey = (eventId: string) => `cache:event:${eventId}`;
const listVersionKey = 'cache:events:list:version';
const listKey = (version: string, variant: string) => `cache:events:list:v${version}:${variant}`;

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null; // corrupt entry: treat as a miss and let the caller overwrite it
  }
}

export async function getCachedEvent<T>(eventId: string): Promise<T | null> {
  return safely(async () => parse<T>(await redis.get(eventKey(eventId))), null);
}

export async function setCachedEvent(eventId: string, event: unknown): Promise<void> {
  await safely(() => redis.set(eventKey(eventId), JSON.stringify(event), 'EX', EVENT_TTL_SECONDS), null);
}

/** Called on update/delete so a stale event is never served after a write. */
export async function invalidateEvent(eventId: string): Promise<void> {
  await safely(() => redis.del(eventKey(eventId)), 0);
}

export async function getCachedEventList<T>(variant: string): Promise<T | null> {
  return safely(async () => {
    const version = (await redis.get(listVersionKey)) ?? '0';
    return parse<T>(await redis.get(listKey(version, variant)));
  }, null);
}

export async function setCachedEventList(variant: string, events: unknown): Promise<void> {
  await safely(async () => {
    const version = (await redis.get(listVersionKey)) ?? '0';
    await redis.set(listKey(version, variant), JSON.stringify(events), 'EX', LIST_TTL_SECONDS);
  }, undefined);
}

/**
 * Bumps a version number baked into every list-variant key (one variant per
 * keyword/city/date/page combination). Old entries become unreachable and
 * expire via their TTL, instead of needing to enumerate and delete every
 * variant key on every write.
 */
export async function invalidateEventList(): Promise<void> {
  await safely(() => redis.incr(listVersionKey), 0);
}
