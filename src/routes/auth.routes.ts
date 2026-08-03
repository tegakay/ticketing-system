import { Router } from 'express';
import { login, logout } from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/asyncHandler';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { loginSchema } from '../validators/account.validator';

const router = Router();

router.post('/login', validate(loginSchema), asyncHandler(login));
router.post('/logout', authenticate, asyncHandler(logout));

export default router;
