import { Router } from "express";
import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from "../controllers/user.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, requireRole, requireSelfOrRole } from "../middleware/auth.js";
import { validate } from "../middleware/validate.js";
import { createAccountSchema, updateAccountSchema } from "../validators/account.validator.js";

const router = Router();

router.get("/", authenticate, requireRole("ADMIN"), asyncHandler(listUsers));
router.get("/:id", authenticate, requireSelfOrRole("ADMIN"), asyncHandler(getUser));
router.post("/", validate(createAccountSchema), asyncHandler(createUser));
router.put(
  "/:id",
  authenticate,
  requireSelfOrRole("ADMIN"),
  validate(updateAccountSchema),
  asyncHandler(updateUser),
);
router.delete("/:id", authenticate, requireSelfOrRole("ADMIN"), asyncHandler(deleteUser));

export default router;
