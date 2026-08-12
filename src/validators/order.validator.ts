import { z } from 'zod';

export const createOrderSchema = z.object({
  quantity: z.number().int().positive().max(10),
});

export const updateOrderSchema = z
  .object({
    user_id: z.string().optional(),
    event_id: z.string().optional(),
    quantity: z.number().int().positive().optional(),
    status: z.string().optional(),
    payment_id: z.string().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

