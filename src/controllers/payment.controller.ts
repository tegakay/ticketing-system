import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { clearHold } from "../services/inventory.service.js";
import { invalidateEvent } from "../services/eventCache.service.js";
import { releasePendingOrder } from "../services/orderLifecycle.service.js";

function signatureMatches(rawBody: Buffer, header: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(header);
  return a.length === b.length && timingSafeEqual(a, b);
}

// POST /webhook/payments: no requireAuth; authenticity comes from the HMAC signature.
export async function handlePaymentWebhook(req: Request, res: Response) {
  const secret = process.env.PAYMENT_WEBHOOK_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "Payment webhook is not configured" });
  }

  const signature = req.headers["pay--signature"];
  if (typeof signature !== "string" || !signature) {
    return res.status(400).json({ error: "Missing signature header" });
  }
  if (!req.rawBody || !signatureMatches(req.rawBody, signature, secret)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { order_id, payment_status } = req.body ?? {};
  if (typeof order_id !== "string" || typeof payment_status !== "string") {
    return res.status(400).json({ error: "order_id and payment_status are required" });
  }

  const order = await prisma.order.findUnique({ where: { order_id } });
  if (!order) return res.status(404).json({ error: "Order not found" });

  switch (payment_status) {
    case "success": {
      // Providers retry webhooks; only a pending order can be confirmed, and only once.
      if (order.status === "confirmed") return res.status(200).json({ received: true });
      if (order.status !== "pending") {
        return res.status(409).json({ error: `Order is ${order.status}, cannot confirm` });
      }

      const confirmed = await prisma.$transaction(async (tx) => {
        const { count } = await tx.order.updateMany({
          where: { order_id, status: "pending" },
          data: { status: "confirmed" },
        });
        if (count === 0) return null; // lost a race to the sweeper / a cancellation
        await tx.ticket.createMany({
          data: Array.from({ length: order.quantity }, () => ({
            order_id: order.order_id,
            event_id: order.event_id,
            user_id: order.user_id,
          })),
        });
        return tx.order.findUnique({ where: { order_id } });
      });
      if (!confirmed) return res.status(409).json({ error: "Order is no longer pending" });

      await clearHold(order_id);
      await invalidateEvent(order.event_id);
      return res.json(confirmed);
    }

    case "checkout.session.expired":
    case "Failed":
      // Already-terminal orders are a no-op, so retried webhooks are harmless.
      await releasePendingOrder(order, "cancelled");
      return res.status(200).json({ received: true });

    default:
      return res.status(200).json({ received: true });
  }
}
