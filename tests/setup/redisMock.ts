import RedisMock from 'ioredis-mock';

// ioredis-mock runs Lua via EVAL, so inventory.service's real reserve/release
// scripts execute against it.
export const redisMock = new RedisMock();

/**
 * Simulates an unreachable Redis by flipping the `status` that
 * src/lib/redisSafe.ts reads. Returns a function that restores it.
 */
export function simulateRedisOutage(): () => void {
  const mock = redisMock as unknown as { status?: string };
  mock.status = 'reconnecting';
  return () => {
    mock.status = undefined;
  };
}
