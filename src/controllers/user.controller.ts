import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../utils/password.js";

function omitPassword<T extends { password: string }>(user: T) {
  const { password: _password, ...rest } = user;
  return rest;
}

export async function listUsers(_req: Request, res: Response) {
  const users = await prisma.user.findMany({ where: { role: "USER" } });
  return res.json(users.map(omitPassword));
}

export async function getUser(req: Request, res: Response) {
  const user = await prisma.user.findFirst({
    where: { id: req.params.id, role: "USER" },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json(omitPassword(user));
}

export async function createUser(req: Request, res: Response) {
  const { email, password, name } = req.body;
  const hashedPassword = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, password: hashedPassword, name, role: "USER" },
  });
  return res.status(201).json(omitPassword(user));
}

export async function updateUser(req: Request, res: Response) {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, role: "USER" },
  });
  if (!existing) return res.status(404).json({ error: "User not found" });

  const { email, password, name } = req.body;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: {
      email,
      name,
      ...(password ? { password: await hashPassword(password) } : {}),
    },
  });
  return res.json(omitPassword(user));
}

export async function deleteUser(req: Request, res: Response) {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, role: "USER" },
  });
  if (!existing) return res.status(404).json({ error: "User not found" });

  await prisma.user.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
