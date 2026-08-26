import { Router } from 'express';
import adminRoutes from './admin.routes';
import authRoutes from './auth.routes';
import eventRoutes from './event.routes';
import userRoutes from './user.routes';
import venueRoutes from './venue.routes';
import orderRoutes from './order.routes';
import paymentRoutes from './payment.routes';

const router = Router();

router.use('/users', userRoutes);
router.use('/admin', adminRoutes);
router.use('/auth', authRoutes);
router.use('/events', eventRoutes);
router.use('/venues', venueRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);

export default router;
