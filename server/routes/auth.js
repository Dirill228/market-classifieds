import { Router } from 'express';
import * as auth from '../controllers/authController.js';
import { requireAuth } from '../middlewares/auth.js';
import { rateLimit } from '../middlewares/rateLimit.js';

const router = Router();
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 40,
  name: 'auth',
  message: 'Слишком много попыток входа. Попробуйте через 15 минут.',
});

router.post('/register', authLimiter, auth.register);
router.post('/login', authLimiter, auth.login);
router.post('/refresh', auth.refresh);
router.post('/logout', auth.logout);
router.post('/forgot-password', authLimiter, auth.forgotPassword);
router.post('/reset-password', authLimiter, auth.resetPassword);
router.get('/me', requireAuth, auth.me);
router.patch('/me', requireAuth, auth.updateMe);
router.post('/me/password', requireAuth, auth.changePassword);

export default router;
