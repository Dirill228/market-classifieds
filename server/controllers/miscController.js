import { query } from '../db.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { cleanString } from '../utils/validate.js';
import { publicUploadUrl } from '../utils/upload.js';

export const uploadChatAttachment = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(422, 'Файл не получен');
  res.status(201).json({
    url: publicUploadUrl(req.file.filename),
    name: req.file.originalname,
    size: req.file.size,
  });
});

export const submitContact = asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name, 80);
  const email = cleanString(req.body.email, 120);
  const topic = cleanString(req.body.topic, 80);
  const message = cleanString(req.body.message, 2000);

  if (name.length < 2) throw new ApiError(422, 'Укажите имя');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ApiError(422, 'Укажите корректный e-mail');
  if (message.length < 20) throw new ApiError(422, 'Опишите вопрос подробнее (минимум 20 символов)');

  await query.run(
    'INSERT INTO contact_requests (name, email, topic, message) VALUES (?, ?, ?, ?)',
    [name, email, topic || 'Общий вопрос', message],
  );
  res.status(201).json({
    ok: true,
    message: 'Обращение отправлено. Поддержка ответит на указанный e-mail в течение рабочего дня.',
  });
});

export const listReports = asyncHandler(async (_req, res) => {
  const rows = await query.all(
    `SELECT r.*, l.title AS listing_title, u.name AS user_name
     FROM reports r JOIN listings l ON l.id = r.listing_id
     LEFT JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC LIMIT 100`,
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      listingId: row.listing_id,
      listingTitle: row.listing_title,
      userName: row.user_name,
      reason: row.reason,
      comment: row.comment,
      status: row.status,
      createdAt: row.created_at,
    })),
  });
});

export const resolveReport = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['reviewed', 'rejected'].includes(status)) throw new ApiError(422, 'Недопустимый статус');
  const report = await query.get('SELECT id FROM reports WHERE id = ?', [req.params.id]);
  if (!report) throw new ApiError(404, 'Жалоба не найдена');
  await query.run('UPDATE reports SET status = ? WHERE id = ?', [status, report.id]);
  res.json({ ok: true });
});

export const moderateListing = asyncHandler(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'rejected', 'moderation', 'archived'].includes(status)) {
    throw new ApiError(422, 'Недопустимый статус');
  }
  const listing = await query.get('SELECT id FROM listings WHERE id = ?', [req.params.id]);
  if (!listing) throw new ApiError(404, 'Объявление не найдено');
  await query.run('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    new Date().toISOString(),
    listing.id,
  ]);
  res.json({ ok: true });
});

export const health = asyncHandler(async (_req, res) => {
  const listings = await query.get("SELECT COUNT(*) AS count FROM listings WHERE status = 'active'");
  res.json({ status: 'ok', activeListings: Number(listings.count), time: new Date().toISOString() });
});
