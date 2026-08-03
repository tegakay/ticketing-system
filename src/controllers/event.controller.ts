import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listEvents(_req: Request, res: Response) {
  const events = await prisma.event.findMany({ include: { venue: true } });
  return res.json(events);
}

export async function getEvent(req: Request, res: Response) {
  const event = await prisma.event.findUnique({
    where: { event_id: req.params.id },
    include: { venue: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });
  return res.json(event);
}

export async function createEvent(req: Request, res: Response) {
  const { name, description, date, venue_id } = req.body;

  const venue = await prisma.venue.findUnique({ where: { venue_id } });
  if (!venue) return res.status(404).json({ error: "Venue not found" });

  const event = await prisma.event.create({
    data: { name, description, date: new Date(date), venue_id },
  });
  return res.status(201).json(event);
}

export async function updateEvent(req: Request, res: Response) {
  const existing = await prisma.event.findUnique({ where: { event_id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event not found" });

  const { name, description, date, venue_id } = req.body;

  if (venue_id) {
    const venue = await prisma.venue.findUnique({ where: { venue_id } });
    if (!venue) return res.status(404).json({ error: "Venue not found" });
  }

  const event = await prisma.event.update({
    where: { event_id: req.params.id },
    data: {
      name,
      description,
      venue_id,
      ...(date ? { date: new Date(date) } : {}),
    },
  });
  return res.json(event);
}

export async function deleteEvent(req: Request, res: Response) {
  const existing = await prisma.event.findUnique({ where: { event_id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event not found" });

  await prisma.event.delete({ where: { event_id: req.params.id } });
  return res.status(204).send();
}
