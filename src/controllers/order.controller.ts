import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { releasePendingOrder } from "../services/orderLifecycle.service.js";

export async function listOrderByUser(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const userId = req.user.id;
  const orders = await prisma.order.findMany({
    where: { user_id: userId },
  });
  return res.json(orders);
}

export async function listOrderByVenueAdmin(req: Request, res: Response) {
  const { event_id } = req.query;
  const orders = await prisma.order.findMany({
    where: { event_id: event_id as string },
  });
  return res.json(orders);
}

export async function listOrderByAdmin(_req: Request, res: Response) {
  const orders = await prisma.order.findMany();
  return res.json(orders);
}

export async function getOrderAdmin(req: Request, res: Response) {
  const { id } = req.params;

  const order = await prisma.order.findFirst({
    where: {
      order_id: id,
    },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(order);
}

export async function getOrder(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });

  const { id } = req.params;
  const userId = req.user.id;

  const order = await prisma.order.findFirst({
    where: {
      order_id: id,
      user_id: userId,
    },
  });

  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(order);
}

// PUT /orders/:id
// Customers may only cancel their own pending order. Letting them write
// status/payment_id/quantity directly would let anyone mark an unpaid order
// "confirmed" or change what they are buying after it was priced.
export async function updateOrder(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const { id } = req.params;

  const existing = await prisma.order.findFirst({ where: { order_id: id, user_id: req.user.id } });
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const { event_id, quantity, payment_id, status } = req.body;
  if (event_id !== undefined || quantity !== undefined || payment_id !== undefined || status !== 'cancelled') {
    return res.status(403).json({ error: 'Orders can only be cancelled' });
  }
  if (existing.status !== 'pending') {
    return res.status(409).json({ error: `Order is ${existing.status}, cannot cancel` });
  }

  if (!(await releasePendingOrder(existing, 'cancelled'))) {
    return res.status(409).json({ error: 'Order is no longer pending' });
  }
  const order = await prisma.order.findUnique({ where: { order_id: existing.order_id } });
  return res.json(order);
}

// DELETE /orders/:id
export async function deleteOrder(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const { id } = req.params;

  const existing = await prisma.order.findFirst({ where: { order_id: id, user_id: req.user.id } });
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  return removeOrder(existing, res);
}

export async function updateOrderAdmin(req: Request, res: Response) {
  const { id } = req.params;

  const existing = await prisma.order.findUnique({ where: { order_id: id } });
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  const { event_id, quantity, payment_id, status } = req.body;

  // Cancelling/expiring a pending order must hand its tickets back.
  if (existing.status === 'pending' && (status === 'cancelled' || status === 'expired')) {
    await releasePendingOrder(existing, status);
  }

  const order = await prisma.order.update({
    where: { order_id: id },
    data: { event_id, quantity, payment_id, status },
  });
  return res.json(order);
}

export async function deleteOrderAdmin(req: Request, res: Response) {
  const { id } = req.params;

  const existing = await prisma.order.findUnique({ where: { order_id: id } });
  if (!existing) return res.status(404).json({ error: 'Order not found' });

  return removeOrder(existing, res);
}

/** Deletes an order, returning its tickets to the pool first if it was still holding them. */
async function removeOrder(
  order: { order_id: string; event_id: string; quantity: number; status: string },
  res: Response,
) {
  if (order.status === 'confirmed') {
    return res.status(409).json({ error: 'Confirmed orders have issued tickets and cannot be deleted' });
  }
  if (order.status === 'pending') {
    await releasePendingOrder(order, 'cancelled');
  }
  await prisma.order.delete({ where: { order_id: order.order_id } });
  return res.status(204).end();
}

// POST /orders/:id/pay
export async function initiatePayment(req: Request, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const userId = req.user.id;
  const { id } = req.params;

  const order = await prisma.order.findUnique({ where: { order_id: id } });

  if (!order || order.user_id !== userId) {
    return res.status(404).json({ error: 'Order not found' });
  }
  if (order.status !== 'pending') {
    return res.status(400).json({ error: `Order is ${order.status}, cannot pay` });
  }
  if (order.expires_at < new Date()) {
    return res.status(410).json({ error: 'Reservation hold has expired' });
  }

  // Placeholder until a payment provider (Stripe) is wired in.
  return res.status(200).json({ checkout_url: 'bbctips.com' });
}
