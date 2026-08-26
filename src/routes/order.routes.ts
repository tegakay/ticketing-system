import { Router } from 'express';
import{ listOrderByUser,  getOrder,  updateOrder, deleteOrder } from '../controllers/order.controller.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

import { updateOrderSchema } from '../validators/order.validator.js';


const router = Router();

router.get('/', asyncHandler(listOrderByUser));
router.get('/:id',authenticate,  asyncHandler(getOrder));
router.put(
  '/:id',
  authenticate,
  validate(updateOrderSchema),
  asyncHandler(updateOrder),
);


router.delete('/:id', authenticate,  asyncHandler(deleteOrder));

export default router;
