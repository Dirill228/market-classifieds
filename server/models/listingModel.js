import { query } from '../db.js';

const BASE_SELECT = `
  SELECT
    l.*,
    c.name  AS category_name,
    c.slug  AS category_slug,
    c.icon  AS category_icon,
    sc.name AS subcategory_name,
    sc.slug AS subcategory_slug,
    loc.name   AS location_name,
    loc.slug   AS location_slug,
    loc.region AS location_region,
    loc.lat    AS location_lat,
    loc.lng    AS location_lng,
    u.name          AS seller_name,
    u.avatar        AS seller_avatar,
    u.rating        AS seller_rating,
    u.reviews_count AS seller_reviews,
    u.verified      AS seller_verified,
    u.created_at    AS seller_created,
    u.city          AS seller_city,
    u.phone         AS seller_phone
  FROM listings l
  JOIN categories c   ON c.id = l.category_id
  LEFT JOIN subcategories sc ON sc.id = l.subcategory_id
  JOIN locations loc  ON loc.id = l.location_id
  JOIN users u        ON u.id = l.user_id
`;

function parseAttributes(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function mapListing(row, images = [], favorite = false) {
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    price: row.price,
    pricePeriod: row.price_period || '',
    condition: row.condition,
    sellerType: row.seller_type,
    delivery: Boolean(row.delivery),
    negotiable: Boolean(row.negotiable),
    status: row.status,
    views: row.views,
    isUrgent: Boolean(row.is_urgent),
    promotedUntil: row.promoted_until,
    address: row.address,
    attributes: parseAttributes(row.attributes),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    category: {
      id: row.category_id,
      name: row.category_name,
      slug: row.category_slug,
      icon: row.category_icon,
    },
    subcategory: row.subcategory_id
      ? { id: row.subcategory_id, name: row.subcategory_name, slug: row.subcategory_slug }
      : null,
    location: {
      id: row.location_id,
      name: row.location_name,
      slug: row.location_slug,
      region: row.location_region,
      lat: row.location_lat,
      lng: row.location_lng,
    },
    seller: {
      id: row.user_id,
      name: row.seller_name,
      avatar: row.seller_avatar,
      rating: row.seller_rating,
      reviewsCount: row.seller_reviews,
      verified: Boolean(row.seller_verified),
      registeredAt: row.seller_created,
      city: row.seller_city,
      phone: row.seller_phone,
    },
    images,
    isFavorite: favorite,
  };
}

export async function attachImages(rows, favoriteIds = new Set()) {
  if (!rows.length) return [];
  const ids = rows.map((row) => row.id);
  const placeholders = ids.map(() => '?').join(',');
  const images = await query.all(
    `SELECT id, listing_id, url, alt, sort_order FROM images
     WHERE listing_id IN (${placeholders}) ORDER BY sort_order ASC, id ASC`,
    ids,
  );
  const grouped = new Map();
  for (const image of images) {
    if (!grouped.has(image.listing_id)) grouped.set(image.listing_id, []);
    grouped.get(image.listing_id).push({
      id: image.id,
      url: image.url,
      alt: image.alt,
    });
  }
  return rows.map((row) => mapListing(row, grouped.get(row.id) || [], favoriteIds.has(row.id)));
}

export async function getFavoriteIds(userId, listingIds) {
  if (!userId || !listingIds.length) return new Set();
  const placeholders = listingIds.map(() => '?').join(',');
  const rows = await query.all(
    `SELECT listing_id FROM favorites WHERE user_id = ? AND listing_id IN (${placeholders})`,
    [userId, ...listingIds],
  );
  return new Set(rows.map((row) => row.listing_id));
}

const SORTS = {
  date: 'l.is_urgent DESC, l.created_at DESC',
  price_asc: 'l.price ASC, l.created_at DESC',
  price_desc: 'l.price DESC, l.created_at DESC',
  popularity: 'l.views DESC, l.created_at DESC',
  relevance: 'l.is_urgent DESC, l.views DESC, l.created_at DESC',
};

export function buildFilters(params = {}) {
  const where = [];
  const values = [];

  where.push("l.status = 'active'");

  if (params.q) {
    where.push('(LOWER(l.title) LIKE ? OR LOWER(l.description) LIKE ?)');
    const term = `%${String(params.q).trim().toLowerCase()}%`;
    values.push(term, term);
  }
  if (params.category) {
    where.push('c.slug = ?');
    values.push(params.category);
  }
  if (params.categoryId) {
    where.push('c.id = ?');
    values.push(params.categoryId);
  }
  if (params.subcategory) {
    where.push('sc.slug = ?');
    values.push(params.subcategory);
  }
  if (params.location) {
    where.push('loc.slug = ?');
    values.push(params.location);
  }
  if (params.priceMin != null && params.priceMin !== '') {
    where.push('l.price >= ?');
    values.push(Number(params.priceMin));
  }
  if (params.priceMax != null && params.priceMax !== '') {
    where.push('l.price <= ?');
    values.push(Number(params.priceMax));
  }
  if (params.condition === 'new' || params.condition === 'used') {
    where.push('l.condition = ?');
    values.push(params.condition);
  }
  if (params.sellerType === 'private' || params.sellerType === 'business') {
    where.push('l.seller_type = ?');
    values.push(params.sellerType);
  }
  if (params.delivery === true || params.delivery === 'true' || params.delivery === '1') {
    where.push('l.delivery = 1');
  }
  if (params.urgent === true || params.urgent === 'true' || params.urgent === '1') {
    where.push('l.is_urgent = 1');
  }
  if (params.sellerId) {
    where.push('l.user_id = ?');
    values.push(Number(params.sellerId));
  }

  return { clause: where.length ? `WHERE ${where.join(' AND ')}` : '', values };
}

export async function searchListings(params = {}, userId = null) {
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = Math.min(48, Math.max(1, Number(params.perPage) || 12));
  const offset = (page - 1) * perPage;
  const { clause, values } = buildFilters(params);
  const order = SORTS[params.sort] || SORTS.date;

  const totalRow = await query.get(
    `SELECT COUNT(*) AS total FROM listings l
     JOIN categories c ON c.id = l.category_id
     LEFT JOIN subcategories sc ON sc.id = l.subcategory_id
     JOIN locations loc ON loc.id = l.location_id
     JOIN users u ON u.id = l.user_id
     ${clause}`,
    values,
  );

  const total = Number(totalRow.total);
  const rows = await query.all(
    `${BASE_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`,
    [...values, perPage, offset],
  );

  const favoriteIds = await getFavoriteIds(userId, rows.map((row) => row.id));
  const items = await attachImages(rows, favoriteIds);

  return {
    items,
    pagination: {
      page,
      perPage,
      total,
      pages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

export async function findListingById(id, userId = null) {
  const row = await query.get(`${BASE_SELECT} WHERE l.id = ?`, [id]);
  if (!row) return null;
  const images = await query.all(
    'SELECT id, url, alt FROM images WHERE listing_id = ? ORDER BY sort_order ASC, id ASC',
    [id],
  );
  const favorite = userId
    ? Boolean(await query.get('SELECT 1 AS ok FROM favorites WHERE user_id = ? AND listing_id = ?', [userId, id]))
    : false;
  return mapListing(row, images.map((image) => ({ id: image.id, url: image.url, alt: image.alt })), favorite);
}

export async function getListingsByIds(ids, userId = null) {
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  const rows = await query.all(
    `${BASE_SELECT} WHERE l.id IN (${placeholders}) AND l.status = 'active'`,
    ids,
  );
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(Number(id))).filter(Boolean);
  const favoriteIds = await getFavoriteIds(userId, ordered.map((row) => row.id));
  return attachImages(ordered, favoriteIds);
}

export async function incrementViews(listingId) {
  const today = new Date().toISOString().slice(0, 10);
  await query.run('UPDATE listings SET views = views + 1 WHERE id = ?', [listingId]);
  await query.run(
    `INSERT INTO listing_views (listing_id, day, count) VALUES (?, ?, 1)
     ON CONFLICT(listing_id, day) DO UPDATE SET count = listing_views.count + 1`,
    [listingId, today],
  );
}

export async function getSimilarListings(listing, limit = 4) {
  const rows = await query.all(
    `${BASE_SELECT}
     WHERE l.status = 'active' AND l.category_id = ? AND l.id != ?
     ORDER BY l.is_urgent DESC, l.views DESC LIMIT ?`,
    [listing.category.id, listing.id, limit],
  );
  if (rows.length >= limit) return attachImages(rows);

  const extra = await query.all(
    `${BASE_SELECT}
     WHERE l.status = 'active' AND l.id != ? AND l.category_id != ?
     ORDER BY l.views DESC LIMIT ?`,
    [listing.id, listing.category.id, limit - rows.length],
  );
  return attachImages([...rows, ...extra]);
}
