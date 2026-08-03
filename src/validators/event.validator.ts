import { z } from 'zod';

export const createEventSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(200).optional(),
  date: z.iso.datetime(),
  venue_id: z.string().min(1),
});

export const updateEventSchema = z
  .object({
    name: z.string().min(2).max(100).optional(),
    description: z.string().max(200).optional(),
    date: z.iso.datetime().optional(),
    venue_id: z.string().optional()
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

