import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../utils/password.js";
import { isUniqueViolation } from "../utils/prismaErrors.js";

function omitPassword<T extends { password: string }>(user: T) {
  const { password: _password, ...rest } = user;
  return rest;
}

export async function listAdmins(_req: Request, res: Response) {
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  return res.json(admins.map(omitPassword));
}

export async function getAdmin(req: Request, res: Response) {
  const admin = await prisma.user.findFirst({
    where: { id: req.params.id, role: "ADMIN" },
  });
  if (!admin) return res.status(404).json({ error: "Admin not found" });
  return res.json(omitPassword(admin));
}

export async function createAdmin(req: Request, res: Response) {
  const { email, password, name } = req.body;
  const hashedPassword = await hashPassword(password);
  try {
    const admin = await prisma.user.create({
      data: { email, password: hashedPassword, name, role: "ADMIN" },
    });
    return res.status(201).json(omitPassword(admin));
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "Email already in use" });
    throw err;
  }
}

export async function updateAdmin(req: Request, res: Response) {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, role: "ADMIN" },
  });
  if (!existing) return res.status(404).json({ error: "Admin not found" });

  const { email, password, name } = req.body;
  try {
    const admin = await prisma.user.update({
      where: { id: req.params.id },
      data: {
        email,
        name,
        ...(password ? { password: await hashPassword(password) } : {}),
      },
    });
    return res.json(omitPassword(admin));
  } catch (err) {
    if (isUniqueViolation(err)) return res.status(409).json({ error: "Email already in use" });
    throw err;
  }
}

export async function deleteAdmin(req: Request, res: Response) {
  const existing = await prisma.user.findFirst({
    where: { id: req.params.id, role: "ADMIN" },
  });
  if (!existing) return res.status(404).json({ error: "Admin not found" });

  await prisma.user.delete({ where: { id: req.params.id } });
  return res.status(204).send();
}
