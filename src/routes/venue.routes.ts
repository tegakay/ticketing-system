import {Router} from "express";
import { createVenue, listVenues, getVenueById, updateVenue, deleteVenue } from "../controllers/venue.controller.js";
import { asyncHandler } from "../middleware/asyncHandler.js";
import { authenticate, requireRole } from "../middleware/auth";
import { validate } from "../middleware/validate";
import { createVenueSchema, updateVenueSchema } from "../validators/venue.validator";

const router = Router();

router.get('/', asyncHandler(listVenues));
router.get('/:id', asyncHandler(getVenueById));
router.post('/', authenticate, requireRole('ADMIN'), validate(createVenueSchema), asyncHandler(createVenue));
router.put('/:id', authenticate, requireRole('ADMIN'), validate(updateVenueSchema), asyncHandler(updateVenue));
router.delete('/:id', authenticate, requireRole('ADMIN'), asyncHandler(deleteVenue));

export default router;
