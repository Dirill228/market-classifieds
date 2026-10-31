import { Router } from 'express';
import * as listings from '../controllers/listingController.js';
import * as catalog from '../controllers/catalogController.js';
import { requireAuth } from '../middlewares/auth.js';
import { rateLimit } from '../middlewares/rateLimit.js';
import { uploadListingImages } from '../utils/upload.js';

const router = Router();

const publishLimiter = rateLimit({
  windowMs: 60 * 60_000,
  max: 30,
  name: 'publish',
  message: 'Лимит публикаций исчерпан. Попробуйте позже.',
});

router.get('/', catalog.getListings);
router.get('/mine', requireAuth, listings.getMyListings);
router.get('/:id', listings.getListing);
router.get('/:id/similar', listings.getSimilar);
router.get('/:id/phone', listings.trackPhoneView);
router.post('/', requireAuth, publishLimiter, uploadListingImages, listings.createListing);
router.patch('/:id', requireAuth, uploadListingImages, listings.updateListing);
router.patch('/:id/status', requireAuth, listings.updateStatus);
router.delete('/:id', requireAuth, listings.deleteListing);
router.post('/:id/report', requireAuth, rateLimit({ windowMs: 60 * 60_000, max: 20, name: 'report' }), listings.reportListing);

export default router;
