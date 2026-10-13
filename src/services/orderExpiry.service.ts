import { prisma } from '../lib/prisma.js';
import { releasePendingOrder } from './orderLifecycle.service.js';

const BATCH_SIZE = 100;

/**
 * Expires pending orders whose reservation hold ran out and returns their
 * tickets to the pool. Driven by Postgres rather than Redis TTL notifications
 * so it keeps working while Redis is down. Safe to run concurrently with the
 * payment webhook (see releasePendingOrder).
 *
 * Returns the number of orders expired.
 */
export async function expireStaleOrders(now: Date = new Date()): Promise<number> {
  const stale = await prisma.order.findMany({
    where: { status: 'pending', expires_at: { lt: now } },
    take: BATCH_SIZE,
  });

  let expired = 0;
  for (const order of stale) {
    if (await releasePendingOrder(order, 'expired')) expired++;
  }
  return expired;
}

export function startOrderExpirySweeper(intervalMs = 30_000): NodeJS.Timeout {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      await expireStaleOrders();
    } catch (err) {
      console.error('[order-expiry] sweep failed', err);
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref();
  return timer;
}
