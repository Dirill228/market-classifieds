import { Router } from 'express';
import authRoutes from './auth.js';
import listingRoutes from './listings.js';
import * as catalog from '../controllers/catalogController.js';
import * as favorites from '../controllers/favoriteController.js';
import * as profile from '../controllers/profileController.js';
import * as users from '../controllers/userController.js';
import * as conversations from '../controllers/conversationController.js';
import * as misc from '../controllers/miscController.js';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { config } from '../config.js';

const router = Router();

router.get('/config', (req, res) => {
  res.json({
    demoMode: config.demoMode,
    demoAccount: config.demoMode
      ? { email: 'demo@market.ru', password: 'demo1234' }
      : null,
    version: '1.0.0',
  });
});

router.get('/health', misc.health);
router.use('/auth', authRoutes);

router.get('/home', catalog.getHome);
router.get('/categories', catalog.getCategories);
router.get('/locations', catalog.getLocations);
router.get('/suggest', catalog.suggest);
router.get('/faq', catalog.getFaq);
router.use('/listings', listingRoutes);

router.get('/favorites', requireAuth, favorites.listFavorites);
router.post('/favorites', requireAuth, favorites.addFavorite);
router.delete('/favorites/:listingId', requireAuth, favorites.removeFavorite);

router.get('/saved-searches', requireAuth, favorites.listSavedSearches);
router.post('/saved-searches', requireAuth, favorites.createSavedSearch);
router.delete('/saved-searches/:id', requireAuth, favorites.deleteSavedSearch);

router.get('/profile/stats', requireAuth, profile.getProfileStats);
router.get('/profile/balance', requireAuth, profile.getBalance);

router.get('/users/:id', users.getUserProfile);
router.get('/users/:id/reviews', users.getReviews);

router.get('/conversations', requireAuth, conversations.listConversations);
router.post('/conversations', requireAuth, conversations.createConversation);
router.get('/conversations/:id', requireAuth, conversations.getConversation);
router.get('/conversations/:id/messages', requireAuth, conversations.getMessages);
router.post('/conversations/:id/messages', requireAuth, conversations.sendMessage);
router.post('/conversations/:id/read', requireAuth, conversations.markRead);
router.post('/conversations/:id/typing', requireAuth, conversations.setTyping);
router.get('/messages/unread-count', requireAuth, conversations.unreadCount);

router.post('/uploads/chat', requireAuth, misc.uploadChatAttachment);
router.post('/contact', misc.submitContact);

router.get('/moderation/reports', requireRole('moderator', 'admin'), misc.listReports);
router.patch('/moderation/reports/:id', requireRole('moderator', 'admin'), misc.resolveReport);
router.patch('/moderation/listings/:id', requireRole('moderator', 'admin'), misc.moderateListing);

export default router;
