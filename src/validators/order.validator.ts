import { z } from 'zod';

export const createOrderSchema = z.object({
  quantity: z.number().int().positive().max(10),
  event_id: z.string().optional(),
  payment_id: z.string().optional(),
});

export const updateOrderSchema = z
  .object({
    event_id: z.string().optional(),
    quantity: z.number().int().positive().optional(),
    payment_id: z.string().optional(),
    status: z.enum(['pending', 'confirmed', 'cancelled', 'expired']).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

