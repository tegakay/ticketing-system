import type { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { comparePassword } from '../utils/password';
import { generateToken } from '../utils/jwt';

export async function login(req: Request, res: Response) {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const passwordMatches = await comparePassword(password, user.password);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = generateToken({ id: user.id, email: user.email, role: user.role });
  return res.json({ token });
}

export function logout(_req: Request, res: Response) {
  return res.json({ message: 'Logged out successfully' });
}
