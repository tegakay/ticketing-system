import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

export async function listOrderByUser(req: Request, res: Response) {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  const userId = req.user.id;
    const orders = await prisma.order.findMany({
        where: { user_id: userId  },
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

export async function listOrderByAdmin(req: Request, res: Response) {
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

export async function createOrder(req: Request, res: Response) {
  //Handled in reserveTickets function in event.controller.ts
}


export async function updateOrder(req: Request, res: Response) {
    const { id } = req.params;
    const { event_id, quantity, payment_id, status } = req.body;

    const order = await prisma.order.update({
        where: { order_id: id },
        data: { event_id, quantity, payment_id, status },
    });
    return res.json(order);

}
export async function deleteOrder(req: Request, res: Response) {
    const { id } = req.params;
    await prisma.order.delete({
        where: { order_id: id }
    });
    return res.status(204).end();
}

//Pay for order
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

  return res.status(200).json({ checkout_url: 'bbctips.com' });

  // Reuse an existing session if one was already created for this order
  // if (order.payment_id) {
  //   const existing = await paymentProvider.retrieveSession(order.payment_id);
  //   if (existing && existing.status === 'open') {
  //     return res.status(200).json({ checkout_url: existing.url });
  //   }
  // }

  // const session = await paymentProvider.createCheckoutSession(
  //   {
  //     amount: order.total_price,
  //     currency: 'usd',
  //     metadata: { order_id: order.order_id }, // the handoff — webhook reads this back
  //     success_url: `${process.env.APP_URL}/orders/${order.order_id}/success`,
  //     cancel_url: `${process.env.APP_URL}/orders/${order.order_id}/cancelled`,
  //   },
  //   { idempotencyKey: `order-${order.order_id}` } // provider-level retry safety
  // );

  // await prisma.order.update({
  //   where: { order_id: order.order_id },
  //   data: { payment_id: session.id },
  // });

  // return res.status(200).json({ checkout_url: session.url });
}   

