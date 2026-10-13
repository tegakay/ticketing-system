import Redis, { type RedisOptions } from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

/**
 * Redis is an accelerator here (cache + inventory counter), not the source of
 * truth, so the app must keep working when it is down. These options make a
 * dead server fail fast instead of queueing commands forever:
 *  - commands error after one reconnect cycle / one second, and
 *  - reconnection keeps retrying in the background with a capped backoff.
 */
const options: RedisOptions = {
  maxRetriesPerRequest: 1,
  commandTimeout: 1000,
  connectTimeout: 2000,
  retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
};

// Main connection: used for regular commands (GET/SET/EVAL/ZADD/etc).
export const redis = new Redis(REDIS_URL, options);

// A SUBSCRIBE'd connection can't issue other commands, so keyspace-notification
// listening needs its own dedicated client, separate from `redis` above.
export const redisSub = new Redis(REDIS_URL, options);

let outage = false;

redis.on('error', (err) => {
  // ioredis emits one error per failed reconnect attempt — log only the first of an outage.
  if (!outage) console.error('[redis] connection error, falling back to Postgres-only mode:', err.message);
  outage = true;
});
redisSub.on('error', () => {});

redis.on('ready', () => {
  if (!outage) return;
  outage = false;
  console.log('[redis] connection restored');
  // Writes made while Redis was unreachable (stock reservations, event edits)
  // never reached it, so anything left over from before the outage may be
  // stale. Drop it; counters re-warm from Postgres on next use.
  purgeDerivedState().catch((err) => console.error('[redis] post-outage purge failed', err));
});

async function purgeDerivedState(): Promise<void> {
  for (const pattern of ['inv:*', 'hold:*', 'cache:*']) {
    let cursor = '0';
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== '0');
  }
}

/**
 * Keyspace notifications are off by default. We need 'Ex' (keyevent, expired)
 * so we can react the instant a TTL-based hold or queue-admission key expires,
 * instead of polling for expiry.
 */
export async function enableExpiryNotifications(): Promise<void> {
  await redis.config('SET', 'notify-keyspace-events', 'Ex');
}
