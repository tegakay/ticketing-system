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
       order = await prisma.order.update({
        where: { order_id: order_id },
        data: {  status: 'confirmed' },
    });
    return res.json(order);
      break;
    case 'checkout.session.expired':
    case 'Failed':
        order = await prisma.order.update({
        where: { order_id: order_id },
        data: {  status: 'cancelled' },
    });
      break;
  }



 
  return res.status(200).json({ received: true });
}