import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getCachedEvent, getCachedEventList, invalidateEvent, invalidateEventList, setCachedEvent, setCachedEventList } from "../services/eventCache.service.js";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { claimInventoryInDb, releaseInventory, reserveInventory, resetInventory } from "../services/inventory.service.js";
import { isUniqueViolation } from "../utils/prismaErrors.js";

const MAX_PAGE_SIZE = 50;

/** Parses a positive integer query param, falling back when it is missing or junk. */
function positiveInt(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function listEvents(req: Request, res: Response) {
  const { keyword, city, startDate, endDate } = req.query;
  const page = positiveInt(req.query.page, 1);
  const pageSize = Math.min(positiveInt(req.query.pageSize, 20), MAX_PAGE_SIZE);

  const where: Prisma.EventWhereInput = { status: 'on_sale' };
  if (keyword) {
    where.OR = [
      { name: { contains: String(keyword), mode: 'insensitive' } },
      { description: { contains: String(keyword), mode: 'insensitive' } },
    ];
  }
  if (city) where.venue = { city: { equals: String(city), mode: 'insensitive' } };
  if (startDate || endDate) {
    const from = startDate ? new Date(String(startDate)) : undefined;
    const to = endDate ? new Date(String(endDate)) : undefined;
    if ((from && Number.isNaN(from.getTime())) || (to && Number.isNaN(to.getTime()))) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
    }
    where.date = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  const variant = JSON.stringify({ keyword, city, startDate, endDate, page, pageSize });
  const cached = await getCachedEventList(variant);
  if (cached) return res.json(cached);

  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, include: { venue: true }, skip: (page - 1) * pageSize, take: pageSize, orderBy: { date: 'asc' } }),
    prisma.event.count({ where }),
  ]);

  const result = { events, total, page, pageSize };
  await setCachedEventList(variant, result);
  return res.json(result);
}

export async function getEvent(req: Request, res: Response) {
  const eventId = req.params.id;
  if (!eventId) return res.status(400).json({ error: "Event id is required" });

  const cached = await getCachedEvent(eventId);
  if (cached) return res.json(cached);

  const event = await prisma.event.findUnique({
    where: { event_id: eventId },
    include: { venue: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });
  await setCachedEvent(eventId, event);
  return res.json(event);
}

export async function createEvent(req: Request, res: Response) {
  const { name, description, date, venue_id, price, capacity } = req.body;

  const venue = await prisma.venue.findUnique({ where: { venue_id } });
  if (!venue) return res.status(404).json({ error: "Venue not found" });

  const event = await prisma.event.create({
    data: { name, description, date: new Date(date), venue_id, price, capacity },
  });
  await invalidateEventList();
  return res.status(201).json(event);
}

export async function updateEvent(req: Request, res: Response) {
  const existing = await prisma.event.findUnique({ where: { event_id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event not found" });

  const { name, description, date, venue_id, price, capacity } = req.body;

  if (venue_id) {
    const venue = await prisma.venue.findUnique({ where: { venue_id } });
    if (!venue) return res.status(404).json({ error: "Venue not found" });
  }

  if (capacity !== undefined && capacity < existing.tickets_reserved) {
    return res.status(409).json({ error: `Capacity cannot be lower than the ${existing.tickets_reserved} tickets already reserved` });
  }

  const event = await prisma.event.update({
    where: { event_id: req.params.id },
    data: {
      name,
      description,
      venue_id,
      ...(date ? { date: new Date(date) } : {}),
      ...(price !== undefined ? { price } : {}),
      ...(capacity !== undefined ? { capacity } : {}),
    },
  });
  // The Redis stock counter was seeded from the old capacity; drop it so it re-warms from Postgres.
  if (capacity !== undefined && capacity !== existing.capacity) await resetInventory(existing.event_id);
  await invalidateEvent(existing.event_id);
  await invalidateEventList();
  return res.json(event);
}

export async function deleteEvent(req: Request, res: Response) {
  const existing = await prisma.event.findUnique({ where: { event_id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event not found" });

  try {
    await prisma.event.delete({ where: { event_id: req.params.id } });
  } catch (err) {
    // P2003: orders/tickets still reference this event.
    if (err instanceof Error && 'code' in err && (err as { code?: string }).code === 'P2003') {
      return res.status(409).json({ error: "Event has orders and cannot be deleted" });
    }
    throw err;
  }
  await resetInventory(existing.event_id);
  await invalidateEvent(existing.event_id);
  await invalidateEventList();
  return res.status(204).send();
}

class SoldOutError extends Error {}

// POST /events/:id/reservations
export async function reserveTickets(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const userId = req.user.id;
  const eventId = req.params.id;
  if (!eventId) return res.status(400).json({ error: 'Event id is required' });
  const { quantity } = req.body;

  const idempotencyKey = req.header('Idempotency-Key');
  if (!idempotencyKey) {
    return res.status(400).json({ error: 'Idempotency-Key header is required' });
  }

  const event = await prisma.event.findUnique({ where: { event_id: eventId } });
  if (!event || event.status !== 'on_sale') {
    return res.status(400).json({ error: 'Event is not open for booking' });
  }

  const findExisting = () =>
    prisma.order.findUnique({
      where: { user_id_idempotency_key: { user_id: userId, idempotency_key: idempotencyKey } },
    });

  const existing = await findExisting();
  if (existing) {
    return res.status(200).json({ order: existing });
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const orderId = randomUUID();

  // 1. Atomic claim against Redis: the actual concurrency-control step. The
  //    hot counter lives in memory instead of contending for a single Postgres
  //    row lock. We generate the order id up front so the Redis hold marker
  //    can be armed before any Postgres row exists. If Redis is unreachable
  //    ('UNAVAILABLE') the claim is made in Postgres inside the transaction
  //    below, which is slower under contention but equally oversell-proof.
  const result = await reserveInventory(eventId, orderId, quantity);

  if (result === 'SOLD_OUT') {
    return res.status(409).json({ error: 'Not enough tickets available' });
  }
  const claimedInRedis = result === 'RESERVED';

  // 2. Persist the order + keep Postgres's tickets_reserved in sync.
  try {
    const newOrder = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (!claimedInRedis && !(await claimInventoryInDb(tx, eventId, quantity))) {
        throw new SoldOutError();
      }
      const order = await tx.order.create({
        data: {
          order_id: orderId,
          user_id: userId,
          event_id: eventId,
          quantity,
          unit_price: event.price,
          total_price: event.price * quantity,
          status: 'pending',
          idempotency_key: idempotencyKey,
          expires_at: expiresAt,
        },
      });
      if (claimedInRedis) {
        await tx.event.update({
          where: { event_id: eventId },
          data: { tickets_reserved: { increment: quantity } },
        });
      }
      return order;
    });

    // Availability just changed: don't let a stale cached "X left" outlive
    // this booking for the rest of its TTL.
    await invalidateEvent(eventId);

    return res.status(201).json({ order: newOrder });
  } catch (err) {
    // The Redis claim succeeded but the order row never landed. Give the units
    // back immediately instead of leaving them stuck until the hold marker is garbage.
    if (claimedInRedis) await releaseInventory(eventId, orderId, quantity);

    if (err instanceof SoldOutError) {
      return res.status(409).json({ error: 'Not enough tickets available' });
    }
    // Two concurrent requests with the same Idempotency-Key both passed the check
    // above; the loser hits the unique constraint. Answer it as a replay.
    if (isUniqueViolation(err)) {
      const winner = await findExisting();
      if (winner) return res.status(200).json({ order: winner });
    }
    throw err;
  }
}
