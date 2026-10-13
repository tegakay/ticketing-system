import { describe, expect, it } from 'vitest';
import { createOrderSchema, updateOrderSchema } from '../../../src/validators/order.validator';

describe('createOrderSchema', () => {
  it.each([1, 10])('accepts quantity %i', (quantity) => {
    expect(createOrderSchema.safeParse({ quantity }).success).toBe(true);
  });

  it.each([0, 11, 1.5, -1])('rejects quantity %s', (quantity) => {
    expect(createOrderSchema.safeParse({ quantity }).success).toBe(false);
  });

  it('rejects a missing quantity', () => {
    expect(createOrderSchema.safeParse({}).success).toBe(false);
  });
});

describe('updateOrderSchema', () => {
  it.each(['pending', 'confirmed', 'cancelled', 'expired'])('accepts status %s', (status) => {
    expect(updateOrderSchema.safeParse({ status }).success).toBe(true);
  });

  it('rejects a status that is not in the Prisma OrderStatus enum', () => {
    expect(updateOrderSchema.safeParse({ status: 'completed' }).success).toBe(false);
  });

  it('rejects an empty body', () => {
    expect(updateOrderSchema.safeParse({}).success).toBe(false);
  });
});
