import { Router } from "express";
import {
  createAdmin,
  deleteAdmin,
  getAdmin,
  listAdmins,
  updateAdmin,
} from "../controllers/admin.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, requireRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createAccountSchema, updateAccountSchema } from "../validators/account.validator.js";
import {
  deleteOrderAdmin,
  getOrderAdmin,
  listOrderByAdmin,
  updateOrderAdmin,
} from "../controllers/order.controller.js";
import { updateOrderSchema } from "../validators/order.validator.js";

const router = Router();

// Order routes must be registered before "/:id", otherwise "/orders" is
// captured as an admin id.
router.get("/orders", authenticate, requireRole("ADMIN"), asyncHandler(listOrderByAdmin));
router.get("/orders/:id", authenticate, requireRole("ADMIN"), asyncHandler(getOrderAdmin));
router.put(
  "/orders/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateOrderSchema),
  asyncHandler(updateOrderAdmin),
);
router.delete("/orders/:id", authenticate, requireRole("ADMIN"), asyncHandler(deleteOrderAdmin));

router.get("/", authenticate, requireRole("ADMIN"), asyncHandler(listAdmins));
router.get("/:id", authenticate, requireRole("ADMIN"), asyncHandler(getAdmin));
router.post(
  "/",
  authenticate,
  requireRole("ADMIN"),
  validate(createAccountSchema),
  asyncHandler(createAdmin),
);
router.put(
  "/:id",
  authenticate,
  requireRole("ADMIN"),
  validate(updateAccountSchema),
  asyncHandler(updateAdmin),
);
router.delete("/:id", authenticate, requireRole("ADMIN"), asyncHandler(deleteAdmin));

export default router;
