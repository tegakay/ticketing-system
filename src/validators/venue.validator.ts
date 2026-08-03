import { z } from 'zod';

export const createVenueSchema = z.object({
  name: z.string(),
  address: z.string().min(8),
  city: z.string().min(1).optional(),
  capacity: z.number().int().positive(),
});

export const updateVenueSchema = z
  .object({
    name: z.string().optional(),
    address: z.string().min(8).optional(),
    city: z.string().min(1).optional(),
    capacity: z.number().int().positive().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

