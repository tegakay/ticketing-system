import { redis } from './redis.js';

/**
 * True unless the client is known to be disconnected. `status` is undefined on
 * test doubles, which are treated as healthy.
 */
export function isRedisUp(): boolean {
  const status = (redis as { status?: string }).status;
  return status === undefined || status === 'ready';
}

/**
 * Runs a Redis operation, degrading to `fallback` when Redis is down or the
 * command fails. Use for best-effort work (cache reads/writes, invalidation).
 */
export async function safely<T>(op: () => Promise<T>, fallback: T): Promise<T> {
  if (!isRedisUp()) return fallback;
  try {
    return await op();
  } catch {
    return fallback;
  }
}
