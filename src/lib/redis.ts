import Redis from 'ioredis';

const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';

// Main connection: used for regular commands (GET/SET/EVAL/ZADD/etc).
export const redis = new Redis(REDIS_URL);

// A SUBSCRIBE'd connection can't issue other commands, so keyspace-notification
// listening needs its own dedicated client, separate from `redis` above.
export const redisSub = new Redis(REDIS_URL);

redis.on('error', (err) => console.error('[redis] connection error', err));
redisSub.on('error', (err) => console.error('[redis:sub] connection error', err));

/**
 * Keyspace notifications are off by default. We need 'Ex' (keyevent, expired)
 * so we can react the instant a TTL-based hold or queue-admission key expires,
 * instead of polling for expiry.
 */
export async function enableExpiryNotifications(): Promise<void> {
  await redis.config('SET', 'notify-keyspace-events', 'Ex');
}
