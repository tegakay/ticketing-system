import type { Role } from '@prisma/client';
import { generateToken } from '../../src/utils/jwt';

export function tokenFor(user: { id: string; role: Role; email?: string }): string {
  return generateToken({ id: user.id, role: user.role, email: user.email ?? `${user.id}@example.com` });
}

export function bearer(user: { id: string; role: Role; email?: string }): string {
  return `Bearer ${tokenFor(user)}`;
}

export const USER = { id: 'user-1', role: 'USER' as const };
export const OTHER_USER = { id: 'user-2', role: 'USER' as const };
export const ADMIN = { id: 'admin-1', role: 'ADMIN' as const };
