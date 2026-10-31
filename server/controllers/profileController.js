import { query } from '../db.js';
import { asyncHandler } from '../utils/http.js';
import { serializeUser } from '../utils/serialize.js';

function dayKey(date) {
  return date.toISOString().slice(0, 10);
}

export const getProfileStats = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const byStatus = await query.all(
    'SELECT status, COUNT(*) AS count FROM listings WHERE user_id = ? GROUP BY status',
    [userId],
  );
  const counts = { active: 0, moderation: 0, rejected: 0, sold: 0, archived: 0 };
  for (const row of byStatus) counts[row.status] = Number(row.count);

  const totalViews = Number((await query.get(
    'SELECT COALESCE(SUM(views), 0) AS total FROM listings WHERE user_id = ?',
    [userId],
  )).total);

  const favorites = Number((await query.get('SELECT COUNT(*) AS count FROM favorites WHERE user_id = ?', [userId])).count);
  const unread = Number((await query.get(
    `SELECT COUNT(*) AS count FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.is_read = 0 AND m.sender_id != ?
       AND (c.buyer_id = ? OR c.seller_id = ?)`,
    [userId, userId, userId],
  )).count);

  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - 29);

  const viewRows = await query.all(
    `SELECT lv.day, SUM(lv.count) AS count
     FROM listing_views lv
     JOIN listings l ON l.id = lv.listing_id
     WHERE l.user_id = ? AND lv.day >= ?
     GROUP BY lv.day`,
    [userId, dayKey(start)],
  );
  const viewsByDay = new Map(viewRows.map((row) => [row.day, Number(row.count)]));
  const series = [];
  for (let index = 0; index < 30; index += 1) {
    const date = new Date(start.getTime() + index * 86400_000);
    const key = dayKey(date);
    series.push({ date: key, value: viewsByDay.get(key) || 0 });
  }

  const spent = Number((await query.get(
    `SELECT COALESCE(SUM(p.price), 0) AS total
     FROM promotions p JOIN listings l ON l.id = p.listing_id WHERE l.user_id = ?`,
    [userId],
  )).total);

  const reviews = await query.all(
    `SELECT r.*, u.name AS author_name, u.avatar AS author_avatar
     FROM reviews r JOIN users u ON u.id = r.author_id
     WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 5`,
    [userId],
  );

  res.json({
    user: serializeUser(req.user),
    counts,
    totalViews,
    favorites,
    unread,
    balance: Math.max(0, 2500 - spent),
    spent,
    viewsSeries: series,
    reviews: reviews.map((review) => ({
      id: review.id,
      rating: review.rating,
      body: review.body,
      createdAt: review.created_at,
      author: { name: review.author_name, avatar: review.author_avatar },
    })),
    verification: {
      phone: Boolean(req.user.phone),
      email: true,
      passport: Boolean(req.user.verified),
      level: req.user.verified ? 'Проверенный продавец' : 'Базовый уровень',
    },
  });
});

export const getBalance = asyncHandler(async (req, res) => {
  const transactions = await query.all(
    `SELECT p.type, p.price, p.starts_at, p.status, l.title
     FROM promotions p JOIN listings l ON l.id = p.listing_id
     WHERE l.user_id = ? ORDER BY p.starts_at DESC LIMIT 10`,
    [req.user.id],
  );
  const spent = transactions.reduce((sum, item) => sum + item.price, 0);
  res.json({
    balance: Math.max(0, 2500 - spent),
    spent,
    transactions: transactions.map((item) => ({
      type: item.type,
      amount: -item.price,
      title: item.title,
      date: item.starts_at,
      status: item.status,
    })),
  });
});
