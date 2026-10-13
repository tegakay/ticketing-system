import { describe, expect, it } from 'vitest';
import { expireStaleOrders } from '../../../src/services/orderExpiry.service';
import { makeOrder } from '../../setup/factories';
import { prismaMock } from '../../setup/prismaMock';
import { redisMock } from '../../setup/redisMock';

describe('expireStaleOrders', () => {
  it('only looks at pending orders past their expiry', async () => {
    const now = new Date('2026-12-01T12:00:00Z');
    prismaMock.order.findMany.mockResolvedValue([]);
    expect(await expireStaleOrders(now)).toBe(0);
    expect(prismaMock.order.findMany).toHaveBeenCalledWith({
      where: { status: 'pending', expires_at: { lt: now } },
      take: 100,
    });
  });

  it('expires the order, decrements tickets_reserved and returns Redis units', async () => {
    prismaMock.order.findMany.mockResolvedValue([makeOrder({ quantity: 3 })]);
    await redisMock.set('inv:event-1', 4);
    await redisMock.set('hold:order-1', 3);

    expect(await expireStaleOrders()).toBe(1);

    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { order_id: 'order-1', status: 'pending' },
      data: { status: 'expired' },
    });
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { event_id: 'event-1' },
      data: { tickets_reserved: { decrement: 3 } },
    });
    expect(await redisMock.get('inv:event-1')).toBe('7');
  });

  it('skips an order that was paid in the meantime', async () => {
    prismaMock.order.findMany.mockResolvedValue([makeOrder()]);
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    await redisMock.set('inv:event-1', 4);
    await redisMock.set('hold:order-1', 2);

    expect(await expireStaleOrders()).toBe(0);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
    expect(await redisMock.get('inv:event-1')).toBe('4');
  });

  it('does not touch Redis for orders reserved through the Postgres fallback (no hold marker)', async () => {
    prismaMock.order.findMany.mockResolvedValue([makeOrder()]);
    await redisMock.set('inv:event-1', 4);

    expect(await expireStaleOrders()).toBe(1);
    expect(await redisMock.get('inv:event-1')).toBe('4');
  });
});
