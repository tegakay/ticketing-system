import { Router } from 'express';
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  updateEvent,
} from '../controllers/event.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { createEventSchema, updateEventSchema } from '../validators/event.validator.js';

const router = Router();

router.get('/', asyncHandler(listEvents));
router.get('/:id', asyncHandler(getEvent));
router.post(
  '/',
  authenticate,
  requireRole('ADMIN'),
  validate(createEventSchema),
  asyncHandler(createEvent),
);
router.put(
  '/:id',
  authenticate,
  requireRole('ADMIN'),
  validate(updateEventSchema),
  asyncHandler(updateEvent),
);
router.delete('/:id', authenticate, requireRole('ADMIN'), asyncHandler(deleteEvent));

export default router;
