import { query } from '../db.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { serializeUser } from '../utils/serialize.js';
import { getListingsByIds } from '../models/listingModel.js';

export const getUserProfile = asyncHandler(async (req, res) => {
  const user = await query.get(
    'SELECT id, name, email, phone, avatar, city, rating, reviews_count, verified, role, created_at FROM users WHERE id = ?',
    [req.params.id],
  );
  if (!user) throw new ApiError(404, 'Пользователь не найден');

  const listingRows = await query.all(
    "SELECT id FROM listings WHERE user_id = ? AND status = 'active' ORDER BY created_at DESC LIMIT 12",
    [user.id],
  );
  const items = await getListingsByIds(listingRows.map((row) => row.id), req.user?.id || null);

  const reviews = await query.all(
    `SELECT r.*, u.name AS author_name, u.avatar AS author_avatar
     FROM reviews r JOIN users u ON u.id = r.author_id
     WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 10`,
    [user.id],
  );

  const distributionRows = await query.all(
    'SELECT rating, COUNT(*) AS count FROM reviews WHERE seller_id = ? GROUP BY rating',
    [user.id],
  );
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const row of distributionRows) distribution[row.rating] = Number(row.count);

  res.json({
    user: serializeUser(user, { phone: user.phone ? undefined : '' }),
    listings: items,
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      body: review.body,
      createdAt: review.created_at,
      author: { name: review.author_name, avatar: review.author_avatar },
    })),
    ratingDistribution: distribution,
    stats: {
      activeListings: items.length,
      joinedAt: user.created_at,
    },
  });
});

export const getReviews = asyncHandler(async (req, res) => {
  const reviews = await query.all(
    `SELECT r.*, u.name AS author_name, u.avatar AS author_avatar
     FROM reviews r JOIN users u ON u.id = r.author_id
     WHERE r.seller_id = ? ORDER BY r.created_at DESC`,
    [req.params.id],
  );
  res.json({
    items: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      body: review.body,
      createdAt: review.created_at,
      author: { name: review.author_name, avatar: review.author_avatar },
    })),
  });
});
