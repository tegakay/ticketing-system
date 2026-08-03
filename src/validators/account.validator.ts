import { z } from 'zod';

export const createAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).optional(),
});

export const updateAccountSchema = z
  .object({
    email: z.string().email().optional(),
    password: z.string().min(8).optional(),
    name: z.string().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
