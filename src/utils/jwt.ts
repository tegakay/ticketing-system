import jwt, { type SignOptions } from 'jsonwebtoken';
import type { Role } from '@prisma/client';

export interface TokenPayload {
  id: string;
  email: string;
  role: Role;
}

const secret = process.env.JWT_SECRET;
if (!secret) {
  throw new Error('JWT_SECRET environment variable is not set');
}
const JWT_SECRET: string = secret;
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '1d') as SignOptions['expiresIn'];

export function generateToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as unknown as TokenPayload;
}
