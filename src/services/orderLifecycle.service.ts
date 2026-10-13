import type { Order } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { releaseHeldInventory } from './inventory.service.js';
import { invalidateEvent } from './eventCache.service.js';

/**
 * Moves a *pending* order to a terminal "no sale" status (cancelled/expired)
 * and gives its tickets back: Postgres' `tickets_reserved` always, the Redis
 * counter when the order took its units from Redis.
 *
 * The transition is conditional on the order still being pending, so it is
 * safe against concurrent paths (payment webhook, user cancel, expiry sweeper):
 * exactly one caller wins and returns true; the rest return false and must not
 * release anything.
 */
export async function releasePendingOrder(
  order: Pick<Order, 'order_id' | 'event_id' | 'quantity'>,
  status: 'cancelled' | 'expired',
): Promise<boolean> {
  const won = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { order_id: order.order_id, status: 'pending' },
      data: { status },
    });
    if (count === 0) return false;
    await tx.event.update({
      where: { event_id: order.event_id },
      data: { tickets_reserved: { decrement: order.quantity } },
    });
    return true;
  });

  if (won) {
    await releaseHeldInventory(order.event_id, order.order_id, order.quantity);
    await invalidateEvent(order.event_id);
  }
  return won;
}
