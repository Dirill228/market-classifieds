import { query } from '../db.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { getListingsByIds } from '../models/listingModel.js';

export const listFavorites = asyncHandler(async (req, res) => {
  const rows = await query.all(
    'SELECT listing_id FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
  );
  const items = await getListingsByIds(rows.map((row) => row.listing_id), req.user.id);
  res.json({ items, total: items.length });
});

export const addFavorite = asyncHandler(async (req, res) => {
  const listingId = Number(req.body.listingId);
  if (!listingId) throw new ApiError(422, 'Не указано объявление');
  const listing = await query.get("SELECT id FROM listings WHERE id = ? AND status = 'active'", [listingId]);
  if (!listing) throw new ApiError(404, 'Объявление не найдено');

  await query.run(
    'INSERT INTO favorites (user_id, listing_id) VALUES (?, ?) ON CONFLICT DO NOTHING',
    [req.user.id, listingId],
  );
  res.status(201).json({ ok: true, isFavorite: true });
});

export const removeFavorite = asyncHandler(async (req, res) => {
  await query.run('DELETE FROM favorites WHERE user_id = ? AND listing_id = ?', [
    req.user.id,
    Number(req.params.listingId),
  ]);
  res.json({ ok: true, isFavorite: false });
});

export const listSavedSearches = asyncHandler(async (req, res) => {
  const rows = await query.all(
    'SELECT * FROM saved_searches WHERE user_id = ? ORDER BY created_at DESC',
    [req.user.id],
  );
  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      query: safeParse(row.query_json),
      createdAt: row.created_at,
    })),
  });
});

export const createSavedSearch = asyncHandler(async (req, res) => {
  const title = String(req.body.title || '').trim().slice(0, 120);
  if (!title) throw new ApiError(422, 'Укажите название поиска');
  const searchQuery = typeof req.body.query === 'string'
    ? req.body.query
    : JSON.stringify(req.body.query || {});

  const result = await query.run(
    'INSERT INTO saved_searches (user_id, title, query_json) VALUES (?, ?, ?)',
    [req.user.id, title, searchQuery],
  );
  res.status(201).json({ ok: true, id: Number(result.lastInsertRowid) });
});

export const deleteSavedSearch = asyncHandler(async (req, res) => {
  await query.run('DELETE FROM saved_searches WHERE id = ? AND user_id = ?', [
    Number(req.params.id),
    req.user.id,
  ]);
  res.json({ ok: true });
});

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
