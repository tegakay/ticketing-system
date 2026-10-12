import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";

// POST /webhooks/payment  — no requireAuth; authenticity comes from signature verification
export async function handlePaymentWebhook(req: Request, res: Response) {
    if (!req.headers['pay--signature']) {
    return res.status(400).json({ error: 'Missing signature header' });
  }
  let {order_id, payment_status} = req.body;
  let order;

     switch (payment_status) {
    case 'success':
      const confirmed = await prisma.$transaction(async (tx) => {
    const updated = await tx.order.update({
      where: { order_id },
      data: { status: 'confirmed' },
    });
    const ticketData = Array.from({ length: updated.quantity }).map(() => ({
      order_id: updated.order_id,
      event_id: updated.event_id,
      user_id: updated.user_id,
    }));
    await tx.ticket.createMany({ data: ticketData });
    return updated;
  });
  return res.json(confirmed);
    //    order = await prisma.order.update({
    //     where: { order_id: order_id },
    //     data: {  status: 'confirmed' },
    // });
      break;
    case 'checkout.session.expired':
      order = await prisma.order.update({
        where: { order_id: order_id },
        data: {  status: 'cancelled' },
    });
    //Update the Event's tickets_reserved count by decrementing the quantity of tickets in the order
    return await prisma.event.update({
      where: { event_id: order.event_id },
      data: {
        tickets_reserved: {
          decrement: order.quantity,
        },
      },
    });
      break;
    case 'Failed':
        order = await prisma.order.update({
        where: { order_id: order_id },
        data: {  status: 'cancelled' },
    });

     //Update the Event's tickets_reserved count by decrementing the quantity of tickets in the order
    return await prisma.event.update({
      where: { event_id: order.event_id },
      data: {
        tickets_reserved: {
          decrement: order.quantity,
        },
      },
    });
      break;
  }



 
  return res.status(200).json({ received: true });
}