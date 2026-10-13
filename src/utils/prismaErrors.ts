import { Prisma } from '@prisma/client';

/** True when a write failed because it would violate a unique constraint. */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
