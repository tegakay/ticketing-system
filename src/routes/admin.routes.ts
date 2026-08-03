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

const router = Router();

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
