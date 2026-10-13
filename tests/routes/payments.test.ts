import { createHmac } from 'node:crypto';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/app';
import { makeOrder } from '../setup/factories';
import { prismaMock } from '../setup/prismaMock';
import { redisMock } from '../setup/redisMock';

const URL = '/api/v1/webhook/payments';
const SECRET = 'whsec_test';

function post(body: unknown, opts: { signature?: string | null } = {}) {
  const raw = JSON.stringify(body);
  const signature = opts.signature === undefined ? createHmac('sha256', SECRET).update(raw).digest('hex') : opts.signature;
  const req = request(app).post(URL).set('Content-Type', 'application/json');
  if (signature) req.set('pay--signature', signature);
  return req.send(raw);
}

beforeEach(() => {
  process.env.PAYMENT_WEBHOOK_SECRET = SECRET;
  prismaMock.order.findUnique.mockResolvedValue(makeOrder());
});

describe('POST /webhook/payments authentication', () => {
  it('is unavailable until a webhook secret is configured', async () => {
    delete process.env.PAYMENT_WEBHOOK_SECRET;
    expect((await post({ order_id: 'order-1', payment_status: 'success' })).status).toBe(503);
  });

  it('rejects a missing signature', async () => {
    expect((await post({ order_id: 'order-1', payment_status: 'success' }, { signature: null })).status).toBe(400);
  });

  it('rejects a forged signature and confirms nothing', async () => {
    const res = await post({ order_id: 'order-1', payment_status: 'success' }, { signature: 'f'.repeat(64) });
    expect(res.status).toBe(401);
    expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.ticket.createMany).not.toHaveBeenCalled();
  });

  it('rejects a signature computed for a different body', async () => {
    const other = createHmac('sha256', SECRET).update('{"order_id":"order-2"}').digest('hex');
    expect((await post({ order_id: 'order-1', payment_status: 'success' }, { signature: other })).status).toBe(401);
  });

  it('rejects a malformed payload', async () => {
    expect((await post({ payment_status: 'success' })).status).toBe(400);
  });

  it('returns 404 for an unknown order', async () => {
    prismaMock.order.findUnique.mockResolvedValue(null);
    expect((await post({ order_id: 'nope', payment_status: 'success' })).status).toBe(404);
  });
});

describe('payment success', () => {
  it('confirms the order, issues one ticket per seat and clears the hold', async () => {
    prismaMock.order.findUnique
      .mockResolvedValueOnce(makeOrder({ quantity: 3 }))
      .mockResolvedValueOnce(makeOrder({ quantity: 3, status: 'confirmed' }));
    await redisMock.set('hold:order-1', 3);

    const res = await post({ order_id: 'order-1', payment_status: 'success' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('confirmed');
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { order_id: 'order-1', status: 'pending' },
      data: { status: 'confirmed' },
    });
    const { data } = prismaMock.ticket.createMany.mock.calls[0]![0];
    expect(data).toHaveLength(3);
    expect(data).toEqual(Array(3).fill({ order_id: 'order-1', event_id: 'event-1', user_id: 'user-1' }));
    expect(await redisMock.get('hold:order-1')).toBeNull();
  });

  it('is idempotent: a retried webhook for a confirmed order issues no more tickets', async () => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ status: 'confirmed' }));
    const res = await post({ order_id: 'order-1', payment_status: 'success' });
    expect(res.status).toBe(200);
    expect(prismaMock.ticket.createMany).not.toHaveBeenCalled();
  });

  it.each(['cancelled', 'expired'] as const)('refuses to confirm a %s order', async (status) => {
    prismaMock.order.findUnique.mockResolvedValue(makeOrder({ status }));
    const res = await post({ order_id: 'order-1', payment_status: 'success' });
    expect(res.status).toBe(409);
    expect(prismaMock.ticket.createMany).not.toHaveBeenCalled();
  });

  it('issues no tickets if the order stopped being pending mid-flight', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ order_id: 'order-1', payment_status: 'success' });
    expect(res.status).toBe(409);
    expect(prismaMock.ticket.createMany).not.toHaveBeenCalled();
  });
});

describe.each(['Failed', 'checkout.session.expired'])('payment %s', (payment_status) => {
  it('cancels the pending order, responds, and releases inventory in Postgres and Redis', async () => {
    await redisMock.set('inv:event-1', 3);
    await redisMock.set('hold:order-1', 2);

    const res = await post({ order_id: 'order-1', payment_status });

    expect(res.status).toBe(200); // the old handler never responded here
    expect(prismaMock.order.updateMany).toHaveBeenCalledWith({
      where: { order_id: 'order-1', status: 'pending' },
      data: { status: 'cancelled' },
    });
    expect(prismaMock.event.update).toHaveBeenCalledWith({
      where: { event_id: 'event-1' },
      data: { tickets_reserved: { decrement: 2 } },
    });
    expect(await redisMock.get('inv:event-1')).toBe('5');
  });

  it('does not decrement twice when retried', async () => {
    prismaMock.order.updateMany.mockResolvedValue({ count: 0 });
    const res = await post({ order_id: 'order-1', payment_status });
    expect(res.status).toBe(200);
    expect(prismaMock.event.update).not.toHaveBeenCalled();
  });
});

it('acknowledges unknown statuses without changing anything', async () => {
  const res = await post({ order_id: 'order-1', payment_status: 'something.else' });
  expect(res.status).toBe(200);
  expect(prismaMock.order.updateMany).not.toHaveBeenCalled();
});
