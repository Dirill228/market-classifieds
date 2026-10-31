import fs from 'node:fs';
import path from 'node:path';
import { query, transaction } from '../db.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { cleanString, validateListing } from '../utils/validate.js';
import { publicUploadUrl } from '../utils/upload.js';
import { config } from '../config.js';
import {
  findListingById,
  getSimilarListings,
  incrementViews,
} from '../models/listingModel.js';

const TARIFFS = {
  normal: { price: 0, urgent: 0, vip: 0 },
  urgent: { price: 149, urgent: 1, vip: 0 },
  vip: { price: 399, urgent: 1, vip: 1 },
};

function ensureOwnership(listing, user) {
  if (listing.user_id !== user.id && user.role !== 'admin') {
    throw new ApiError(403, 'Можно изменять только свои объявления');
  }
}

function removeUploadedFiles(files = []) {
  for (const file of files) {
    fs.promises.unlink(path.join(config.uploadsDir, path.basename(file.filename))).catch(() => {});
  }
}

async function validateReferences(payload) {
  const category = await query.get('SELECT id FROM categories WHERE id = ?', [payload.categoryId]);
  if (!category) throw new ApiError(422, 'Категория не найдена');
  const location = await query.get('SELECT id FROM locations WHERE id = ?', [payload.locationId]);
  if (!location) throw new ApiError(422, 'Город не найден');
  if (payload.subcategoryId) {
    const sub = await query.get(
      'SELECT id FROM subcategories WHERE id = ? AND category_id = ?',
      [payload.subcategoryId, payload.categoryId],
    );
    if (!sub) throw new ApiError(422, 'Подкатегория не соответствует категории');
  }
}

export const createListing = asyncHandler(async (req, res) => {
  try {
    const files = req.files || [];
    const payload = validateListing(req.body);
    await validateReferences(payload);

    const tariffKey = Object.hasOwn(TARIFFS, req.body.tariff) ? req.body.tariff : 'normal';
    const tariff = TARIFFS[tariffKey];
    const now = new Date();
    const promotedUntil = tariff.vip
      ? new Date(now.getTime() + 7 * 86400_000).toISOString()
      : null;

    const listingId = await transaction(async () => {
      const result = await query.run(
        `INSERT INTO listings (
          user_id, category_id, subcategory_id, location_id, title, description, price,
          price_period, condition, seller_type, delivery, negotiable, status, views,
          is_urgent, promoted_until, address, attributes, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, ?, ?, ?, ?, ?, ?)`,
        [
          req.user.id,
          payload.categoryId,
          payload.subcategoryId,
          payload.locationId,
          payload.title,
          payload.description,
          payload.price,
          payload.pricePeriod,
          payload.condition,
          payload.sellerType,
          payload.delivery,
          payload.negotiable,
          tariff.urgent,
          promotedUntil,
          payload.address,
          payload.attributes,
          now.toISOString(),
          now.toISOString(),
        ],
      );

      const id = Number(result.lastInsertRowid);
      for (const [index, file] of files.entries()) {
        await query.run(
          'INSERT INTO images (listing_id, url, alt, sort_order) VALUES (?, ?, ?, ?)',
          [id, publicUploadUrl(file.filename), payload.title, index],
        );
      }

      if (tariff.price > 0) {
        await query.run(
          `INSERT INTO promotions (listing_id, type, price, starts_at, ends_at, status)
           VALUES (?, ?, ?, ?, ?, 'active')`,
          [id, tariff.vip ? 'vip' : 'urgent', tariff.price, now.toISOString(), promotedUntil || new Date(now.getTime() + 86400_000).toISOString()],
        );
      }

      return id;
    });

    const listing = await findListingById(listingId, req.user.id);
    res.status(201).json({ listing, message: 'Объявление опубликовано' });
  } catch (error) {
    removeUploadedFiles(req.files);
    throw error;
  }
});

export const updateListing = asyncHandler(async (req, res) => {
  const existing = await query.get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
  if (!existing) throw new ApiError(404, 'Объявление не найдено');
  ensureOwnership(existing, req.user);

  try {
    const payload = validateListing(req.body);
    await validateReferences(payload);

    const files = req.files || [];
    await transaction(async () => {
      await query.run(
        `UPDATE listings SET
          category_id = ?, subcategory_id = ?, location_id = ?, title = ?, description = ?,
          price = ?, price_period = ?, condition = ?, seller_type = ?, delivery = ?,
          negotiable = ?, address = ?, attributes = ?, updated_at = ?
         WHERE id = ?`,
        [
          payload.categoryId,
          payload.subcategoryId,
          payload.locationId,
          payload.title,
          payload.description,
          payload.price,
          payload.pricePeriod,
          payload.condition,
          payload.sellerType,
          payload.delivery,
          payload.negotiable,
          payload.address,
          payload.attributes,
          new Date().toISOString(),
          existing.id,
        ],
      );

      if (files.length) {
        const existingImages = await query.all('SELECT id, url FROM images WHERE listing_id = ?', [existing.id]);
        const maxOrder = existingImages.length;
        const slots = Math.max(0, 10 - existingImages.length);
        for (const [index, file] of files.slice(0, slots).entries()) {
          await query.run(
            'INSERT INTO images (listing_id, url, alt, sort_order) VALUES (?, ?, ?, ?)',
            [existing.id, publicUploadUrl(file.filename), payload.title, maxOrder + index],
          );
        }
      }
    });

    const listing = await findListingById(existing.id, req.user.id);
    res.json({ listing, message: 'Изменения сохранены' });
  } catch (error) {
    removeUploadedFiles(req.files);
    throw error;
  }
});

export const updateStatus = asyncHandler(async (req, res) => {
  const existing = await query.get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
  if (!existing) throw new ApiError(404, 'Объявление не найдено');
  ensureOwnership(existing, req.user);

  const status = req.body.status;
  const allowed = ['active', 'sold', 'archived'];
  if (!allowed.includes(status)) throw new ApiError(422, 'Недопустимый статус');

  await query.run('UPDATE listings SET status = ?, updated_at = ? WHERE id = ?', [
    status,
    new Date().toISOString(),
    existing.id,
  ]);
  res.json({ ok: true, listing: await findListingById(existing.id, req.user.id) });
});

export const deleteListing = asyncHandler(async (req, res) => {
  const existing = await query.get('SELECT * FROM listings WHERE id = ?', [req.params.id]);
  if (!existing) throw new ApiError(404, 'Объявление не найдено');
  ensureOwnership(existing, req.user);

  await query.run('DELETE FROM listings WHERE id = ?', [existing.id]);
  res.json({ ok: true, message: 'Объявление удалено' });
});

export const getListing = asyncHandler(async (req, res) => {
  const listing = await findListingById(req.params.id, req.user?.id || null);
  if (!listing) throw new ApiError(404, 'Объявление не найдено');
  if (listing.status !== 'active' && req.user?.id !== listing.seller.id && req.user?.role !== 'admin') {
    throw new ApiError(404, 'Объявление недоступно');
  }

  if (req.user?.id !== listing.seller.id) {
    await incrementViews(listing.id);
    listing.views += 1;
  }

  const sellerListings = await query.all(
    `SELECT COUNT(*) AS count FROM listings WHERE user_id = ? AND status = 'active'`,
    [listing.seller.id],
  );

  res.json({
    listing,
    sellerStats: {
      activeListings: Number(sellerListings[0]?.count) || 0,
    },
  });
});

export const getSimilar = asyncHandler(async (req, res) => {
  const listing = await findListingById(req.params.id, req.user?.id || null);
  if (!listing) throw new ApiError(404, 'Объявление не найдено');
  res.json({ items: await getSimilarListings(listing) });
});

export const reportListing = asyncHandler(async (req, res) => {
  const listing = await query.get('SELECT id, status FROM listings WHERE id = ?', [req.params.id]);
  if (!listing) throw new ApiError(404, 'Объявление не найдено');

  const reason = cleanString(req.body.reason, 80);
  const comment = cleanString(req.body.comment, 600);
  const reasons = ['Мошенничество', 'Запрещённый товар', 'Неверная категория', 'Спам или дубликат', 'Другое'];
  if (!reasons.includes(reason)) throw new ApiError(422, 'Выберите причину жалобы');

  await query.run(
    'INSERT INTO reports (listing_id, user_id, reason, comment) VALUES (?, ?, ?, ?)',
    [listing.id, req.user?.id || null, reason, comment],
  );

  const newReports = await query.get(
    "SELECT COUNT(*) AS count FROM reports WHERE listing_id = ? AND status = 'new'",
    [listing.id],
  );
  if (Number(newReports.count) >= 3 && listing.status === 'active') {
    await query.run("UPDATE listings SET status = 'moderation' WHERE id = ?", [listing.id]);
  }

  res.status(201).json({
    ok: true,
    message: 'Жалоба принята. Модераторы проверят объявление в течение 24 часов.',
  });
});

export const trackPhoneView = asyncHandler(async (req, res) => {
  const listing = await query.get(
    `SELECT u.phone AS seller_phone
     FROM listings l JOIN users u ON u.id = l.user_id
     WHERE l.id = ?`,
    [req.params.id],
  );
  if (!listing) throw new ApiError(404, 'Объявление не найдено');
  res.json({ phone: listing.seller_phone || '+7 (900) 000-00-00' });
});

export const getMyListings = asyncHandler(async (req, res) => {
  const status = req.query.status;
  const params = [req.user.id];
  let clause = 'WHERE l.user_id = ?';
  if (status && ['active', 'moderation', 'rejected', 'sold', 'archived'].includes(status)) {
    clause += ' AND l.status = ?';
    params.push(status);
  }

  const rows = await query.all(
    `SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
      NULL AS subcategory_name, NULL AS subcategory_slug,
      loc.name AS location_name, loc.slug AS location_slug, loc.region AS location_region,
      loc.lat AS location_lat, loc.lng AS location_lng,
      u.name AS seller_name, u.avatar AS seller_avatar, u.rating AS seller_rating,
      u.reviews_count AS seller_reviews, u.verified AS seller_verified,
      u.created_at AS seller_created, u.city AS seller_city, u.phone AS seller_phone
     FROM listings l
     JOIN categories c ON c.id = l.category_id
     JOIN locations loc ON loc.id = l.location_id
     JOIN users u ON u.id = l.user_id
     ${clause}
     ORDER BY l.created_at DESC`,
    params,
  );

  const ids = rows.map((row) => row.id);
  const images = ids.length
    ? await query.all(
      `SELECT listing_id, url, alt FROM images WHERE listing_id IN (${ids.map(() => '?').join(',')}) ORDER BY sort_order`,
      ids,
    )
    : [];
  const grouped = new Map();
  for (const image of images) {
    if (!grouped.has(image.listing_id)) grouped.set(image.listing_id, []);
    grouped.get(image.listing_id).push({ url: image.url, alt: image.alt });
  }

  res.json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      price: row.price,
      status: row.status,
      views: row.views,
      createdAt: row.created_at,
      isUrgent: Boolean(row.is_urgent),
      category: { name: row.category_name, slug: row.category_slug, icon: row.category_icon },
      location: { name: row.location_name, slug: row.location_slug },
      images: grouped.get(row.id) || [],
    })),
  });
});
