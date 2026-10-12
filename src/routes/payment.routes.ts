// payment.routes.ts

import { Router } from "express";
import { handlePaymentWebhook } from "../controllers/payment.controller.js";

const router = Router();

router.post("/payments", handlePaymentWebhook);

export default router;