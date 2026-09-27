import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { getCachedEvent, getCachedEventList, invalidateEvent, invalidateEventList, setCachedEventList } from "../services/eventCache.service.js";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { releaseInventory, reserveInventory } from "../services/inventory.service.js";




// export async function listEvents(req: Request, res: Response) {
//   const { keyword, city, startDate, endDate, page = '1', pageSize = '20' } = req.query;

//   const where: any = { status: 'on_sale' };
//   if (keyword) {
//     where.OR = [
//       { name: { contains: String(keyword), mode: 'insensitive' } },
//       { description: { contains: String(keyword), mode: 'insensitive' } },
//     ];
//   }
//   if (city) where.venue = { city: { equals: String(city), mode: 'insensitive' } };
//   if (startDate || endDate) {
//     where.date = {
//       ...(startDate ? { gte: new Date(String(startDate)) } : {}),
//       ...(endDate ? { lte: new Date(String(endDate)) } : {}),
//     };
//   }

//   const take = Math.min(Number(pageSize), 50);
//   const skip = (Number(page) - 1) * take;

//   const [events, total] = await Promise.all([
//     prisma.event.findMany({ where, include: { venue: true }, skip, take, orderBy: { date: 'asc' } }),
//     prisma.event.count({ where }),
//   ]);

//   return res.json({ events, total, page: Number(page), pageSize: take });
// }

 export async function listEvents(req: Request, res: Response) {
   const { keyword, city, startDate, endDate, page = '1', pageSize = '20' } = req.query;

   const variant = JSON.stringify({ keyword, city, startDate, endDate, page, pageSize });
   const cached = await getCachedEventList(variant);
   if (cached) return res.json(cached);

    console.error('Cache miss for event list, querying database...');
   const where: Prisma.EventWhereInput = { status: 'on_sale' };
   if (keyword) {
     where.OR = [
       { name: { contains: String(keyword), mode: 'insensitive' } },
       { description: { contains: String(keyword), mode: 'insensitive' } },
     ];
   }
   if (city) where.venue = { city: { equals: String(city), mode: 'insensitive' } };
   if (startDate || endDate) {
     where.date = {
       ...(startDate ? { gte: new Date(String(startDate)) } : {}),
       ...(endDate ? { lte: new Date(String(endDate)) } : {}),
     };
   }

   const take = Math.min(Number(pageSize), 50);
   const skip = (Number(page) - 1) * take;

   const [events, total] = await Promise.all([
     prisma.event.findMany({ where, include: { venue: true }, skip, take, orderBy: { date: 'asc' } }),
     prisma.event.count({ where }),
   ]);

   const result = { events, total, page: Number(page), pageSize: take };
   await setCachedEventList(variant, result);
   return res.json(result);
 }



export async function getEvent(req: Request, res: Response) {

  const eventId = req.params.id;
  if (!eventId) return res.status(400).json({ error: "Event id is required" });

  const cached = await getCachedEvent(eventId);
  if (cached) return res.json(cached);
  
  const event = await prisma.event.findUnique({
    where: { event_id: req.params.id },
    include: { venue: true },
  });
  if (!event) return res.status(404).json({ error: "Event not found" });
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
  await invalidateEvent(req.params.id!);
  await invalidateEventList();
  return res.json(event);
}

export async function deleteEvent(req: Request, res: Response) {
  const existing = await prisma.event.findUnique({ where: { event_id: req.params.id } });
  if (!existing) return res.status(404).json({ error: "Event not found" });

  await prisma.event.delete({ where: { event_id: req.params.id } });
  await invalidateEvent(req.params.id!);
  await invalidateEventList();
  return res.status(204).send();
}

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

  const existing = await prisma.order.findUnique({
    where: {
      user_id_idempotency_key: {
        user_id: userId,
        idempotency_key: idempotencyKey,
      },
    },
  });

  if (existing) {
    return res.status(200).json({ order: existing });
  }

  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const orderId = randomUUID();

  // 1. Atomic claim against Redis — this is the actual concurrency-control
  //    step. It replaces the old conditional Postgres UPDATE: same
  //    correctness guarantee (no oversell), but the hot counter lives in
  //    memory instead of contending for a single Postgres row lock, and the
  //    hold auto-releases on TTL expiry instead of needing a cron sweep.
  //    We generate the order id up front so the Redis hold key can be armed
  //    before any Postgres row exists — nothing is written to Postgres for
  //    a sold-out attempt.
  const result = await reserveInventory(eventId, orderId, quantity);

  if (result === 'SOLD_OUT') {
    return res.status(409).json({ error: 'Not enough tickets available' });
  }

  // 2. Persist the order + keep Postgres's tickets_reserved in sync for
  //    admin/reporting views. Redis already guarded correctness, so this
  //    write doesn't need to be atomic/conditional — just durable.
  try {
    const newOrder = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const order = await tx.order.create({
        data: {
          order_id: orderId,
          user_id: userId,
          event_id: eventId,
          quantity,
          unit_price: event.price,
          total_price: event.price * quantity,
          status: 'pending',
          expires_at: expiresAt,
        },
      });
      await tx.event.update({
        where: { event_id: eventId },
        data: { tickets_reserved: { increment: quantity } },
      });
      return order;
    });

    // Booking is complete — if this event has a waiting room, free the
    // caller's admission slot now rather than holding it for the full
    // window, so the next person in line gets in sooner.
    // await releaseAdmissionSlot(eventId, userId);

    // Availability just changed — don't let a stale cached "X left" outlive
    // this booking for the rest of its TTL.
    await invalidateEvent(eventId);

    return res.status(201).json({ order: newOrder });
  } catch (err) {
    // The Redis claim already succeeded but the order row never landed —
    // without this, the reserved inventory would be stuck decremented
    // forever, since the hold key's expiry listener releases by looking up
    // an Order row that would never exist. Release immediately instead.
    await releaseInventory(eventId, orderId, quantity);
    throw err;
  }
}

// export async function reserveTickets(req: Request, res: Response) {
//   if (!req.user) return res.status(401).json({ error: 'Authentication required' });
//   const userId = req.user.id;
//   const eventId = req.params.id;
//   if (!eventId) return res.status(400).json({ error: 'Event id is required' });
//   const { quantity } = req.body;

//    const idempotencyKey = req.header('Idempotency-Key');
//     if (!idempotencyKey) {
//     return res.status(400).json({ error: 'Idempotency-Key header is required' });
//   }

//   const event = await prisma.event.findUnique({ where: { event_id: eventId } });
//   if (!event || event.status !== 'on_sale') {
//     return res.status(400).json({ error: 'Event is not open for booking' });
//   }

//   const existing = await prisma.order.findUnique({
//     where: {
//       user_id_idempotency_key: {
//         user_id: userId,
//         idempotency_key: idempotencyKey,
//       },
//     },
//   });

//   if (existing) {
//     return res.status(200).json({ order: existing });
//   }

//   const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

//   // Step 2+3 happen together, in a transaction, so they succeed or fail as one unit
//   const order = await prisma.$transaction(async (tx) => {
//     // 2. Atomic hold — the claim itself
//     const claimed = await tx.$executeRaw`
//       UPDATE "Event"
//       SET tickets_reserved = tickets_reserved + ${quantity}
//       WHERE event_id = ${eventId}
//         AND status = 'on_sale'
//         AND (capacity - tickets_reserved) >= ${quantity}
//     `;

//     if (claimed === 0) {
//       throw new Error('SOLD_OUT');
//     }

//     // 3. Order row — this IS the hold's record, not a separate link step
//     let newOrder = await tx.order.create({
//       data: {
//         user_id: userId,
//         event_id: eventId,
//         quantity,
//         unit_price: event.price,
//         total_price: event.price * quantity,
//         status: 'pending',
//         expires_at: expiresAt,
//       },
//     });
//      return newOrder;

//     //Update ticket available i n the event table
//     // return await tx.event.update({
//     //   where: { event_id: eventId },
//     //   data: {
//     //     tickets_reserved: {
//     //       increment: quantity,
//     //     },
//     //   },
//     // });
//   }).catch((err) => {
//     if (err.message === 'SOLD_OUT') {
//       return null;
//     }
//     throw err;
//   });

//   if (!order) {
//     return res.status(409).json({ error: 'Not enough tickets available' });
//   }

//   return res.status(201).json({ order });
// }

