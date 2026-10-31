import { query } from '../db.js';
import { asyncHandler } from '../utils/http.js';
import { attachImages, getFavoriteIds, searchListings } from '../models/listingModel.js';

export const getCategories = asyncHandler(async (_req, res) => {
  const categories = await query.all(`
    SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id = c.id AND l.status = 'active') AS count
    FROM categories c ORDER BY c.sort_order ASC
  `);
  const subcategories = await query.all('SELECT * FROM subcategories ORDER BY id ASC');
  const grouped = new Map();
  for (const sub of subcategories) {
    if (!grouped.has(sub.category_id)) grouped.set(sub.category_id, []);
    grouped.get(sub.category_id).push({ id: sub.id, name: sub.name, slug: sub.slug });
  }
  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      description: category.description,
      count: Number(category.count),
      subcategories: grouped.get(category.id) || [],
    })),
  });
});

export const getLocations = asyncHandler(async (_req, res) => {
  const locations = await query.all(`
    SELECT loc.*, (SELECT COUNT(*) FROM listings l WHERE l.location_id = loc.id AND l.status = 'active') AS count
    FROM locations loc ORDER BY count DESC, loc.name ASC
  `);
  res.json({
    locations: locations.map((location) => ({
      id: location.id,
      name: location.name,
      slug: location.slug,
      region: location.region,
      lat: location.lat,
      lng: location.lng,
      count: Number(location.count),
    })),
  });
});

export const getListings = asyncHandler(async (req, res) => {
  const params = {
    q: req.query.q,
    category: req.query.category,
    subcategory: req.query.subcategory,
    location: req.query.location,
    priceMin: req.query.priceMin,
    priceMax: req.query.priceMax,
    condition: req.query.condition,
    sellerType: req.query.sellerType,
    delivery: req.query.delivery,
    urgent: req.query.urgent,
    sellerId: req.query.sellerId,
    sort: req.query.sort,
    page: req.query.page,
    perPage: req.query.perPage,
  };
  const result = await searchListings(params, req.user?.id || null);

  const aggregates = await query.get(`
    SELECT
      MIN(price) AS minPrice,
      MAX(price) AS maxPrice
    FROM listings l
    JOIN categories c ON c.id = l.category_id
    JOIN locations loc ON loc.id = l.location_id
    WHERE l.status = 'active'
      ${params.category ? 'AND c.slug = ?' : ''}
  `, params.category ? [params.category] : []);

  res.json({ ...result, aggregates: { minPrice: Number(aggregates.minPrice), maxPrice: Number(aggregates.maxPrice) } });
});

export const getHome = asyncHandler(async (req, res) => {
  const userId = req.user?.id || null;
  const recommendedRows = await query.all(`
    SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
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
    WHERE l.status = 'active'
    ORDER BY (l.promoted_until IS NOT NULL) DESC, l.views DESC, l.created_at DESC
    LIMIT 10
  `);
  const favoriteIds = await getFavoriteIds(userId, recommendedRows.map((row) => row.id));

  const urgentRows = await query.all(`
    SELECT l.*, c.name AS category_name, c.slug AS category_slug, c.icon AS category_icon,
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
    WHERE l.status = 'active' AND l.is_urgent = 1
    ORDER BY l.created_at DESC LIMIT 6
  `);

  const categories = await query.all(`
    SELECT c.*, (SELECT COUNT(*) FROM listings l WHERE l.category_id = c.id AND l.status = 'active') AS count
    FROM categories c ORDER BY c.sort_order ASC
  `);

  const stats = {
    users: Number((await query.get('SELECT COUNT(*) AS count FROM users')).count),
    listings: Number((await query.get('SELECT COUNT(*) AS count FROM listings WHERE status = \'active\'')).count),
    cities: Number((await query.get('SELECT COUNT(*) AS count FROM locations')).count),
    deals: Number((await query.get('SELECT COUNT(*) AS count FROM listings WHERE status = \'sold\'')).count),
  };

  const recommended = await attachImages(recommendedRows, favoriteIds);
  const urgent = await attachImages(urgentRows, favoriteIds);
  const endsAt = new Date();
  endsAt.setHours(23, 59, 59, 999);

  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
      count: Number(category.count),
    })),
    recommended,
    urgent: urgent.map((item) => ({ ...item, urgentEndsAt: endsAt.toISOString() })),
    showcase: recommended.filter((item) => item.images.length).slice(0, 3),
    stats,
    popularQueries: [
      { label: 'iPhone 15', href: '/catalog.html?q=iPhone' },
      { label: 'Квартира в новостройке', href: '/catalog.html?category=realty' },
      { label: 'Toyota Camry', href: '/catalog.html?q=Toyota' },
      { label: 'MacBook Air', href: '/catalog.html?q=MacBook' },
      { label: 'Сдать квартиру', href: '/catalog.html?category=rent' },
      { label: 'Щенки в добрые руки', href: '/catalog.html?category=animals' },
    ],
  });
});

export const suggest = asyncHandler(async (req, res) => {
  const term = String(req.query.q || '').trim();
  if (term.length < 2) return res.json({ suggestions: [] });

  const like = `%${term.toLowerCase()}%`;
  const categories = await query.all(
    'SELECT name, slug, icon FROM categories WHERE LOWER(name) LIKE ? LIMIT 4',
    [like],
  );
  const listings = await query.all(
    `SELECT l.id, l.title, l.price, loc.name AS city
     FROM listings l JOIN locations loc ON loc.id = l.location_id
     WHERE l.status = 'active' AND LOWER(l.title) LIKE ?
     ORDER BY l.views DESC LIMIT 6`,
    [like],
  );

  res.json({
    suggestions: [
      ...categories.map((category) => ({
        type: 'category',
        label: category.name,
        icon: category.icon,
        href: `/catalog.html?category=${category.slug}`,
      })),
      ...listings.map((listing) => ({
        type: 'listing',
        label: listing.title,
        hint: `${listing.city} · ${new Intl.NumberFormat('ru-RU').format(listing.price)} ₽`,
        href: `/listing.html?id=${listing.id}`,
      })),
    ],
  });
});

export const getFaq = asyncHandler(async (_req, res) => {
  res.json({
    groups: [
      {
        id: 'general',
        title: 'Общие вопросы',
        items: [
          {
            question: 'Как разместить объявление?',
            answer: 'Нажмите «Разместить объявление» в шапке сайта, выберите категорию, заполните параметры и добавьте до 10 фотографий. Публикация занимает около двух минут и бесплатна для частных продавцов.',
          },
          {
            question: 'Сколько стоит размещение?',
            answer: 'Базовое объявление бесплатно. Платными являются продвижение: срочная публикация — 149 ₽, VIP-размещение на 7 дней — 399 ₽. Тариф можно изменить в личном кабинете.',
          },
          {
            question: 'Как связаться с продавцом?',
            answer: 'На странице объявления нажмите «Написать» — откроется чат. Позвонить можно по кнопке «Показать телефон». Мы не рекомендуем переводить предоплату без проверки товара.',
          },
        ],
      },
      {
        id: 'safety',
        title: 'Безопасность',
        items: [
          {
            question: 'Как не стать жертвой мошенников?',
            answer: 'Встречайтесь в людных местах, проверяйте товар до оплаты и не переходите по подозрительным ссылкам для оплаты. Сотрудники «Маркета» никогда не запрашивают коды из СМС.',
          },
          {
            question: 'Что делать, если объявление кажется подозрительным?',
            answer: 'Нажмите «Пожаловаться» на странице объявления и укажите причину. Модераторы проверят публикацию в течение 24 часов, при подтверждении нарушение будет устранено.',
          },
          {
            question: 'Как работает модерация?',
            answer: 'Автоматические фильтры проверяют новые объявления на запрещённые товары и дубликаты. Спорные публикации просматривают модераторы. Мы также скрываем объявления, получившие три и более обоснованных жалобы.',
          },
        ],
      },
      {
        id: 'payments',
        title: 'Оплата и продвижение',
        items: [
          {
            question: 'Как оплатить продвижение?',
            answer: 'Выберите тариф на шаге публикации или в личном кабинете. Доступны банковские карты и баланс личного кабинета. Чек приходит на e-mail в течение суток.',
          },
          {
            question: 'Можно ли вернуть деньги за продвижение?',
            answer: 'Если объявление было отклонено модератором, средства за продвижение возвращаются на баланс автоматически. Для остальных случаев напишите в поддержку.',
          },
        ],
      },
      {
        id: 'account',
        title: 'Аккаунт',
        items: [
          {
            question: 'Как удалить аккаунт?',
            answer: 'В настройках личного кабинета выберите «Удалить профиль». Объявления будут сняты с публикации, история переписки удалится в течение 30 дней.',
          },
          {
            question: 'Зачем нужна верификация?',
            answer: 'Подтверждение телефона и паспорта повышает доверие покупателей и открывает доступ к платным инструментам. Значок «Проверенный продавец» отображается в карточке профиля.',
          },
        ],
      },
    ],
  });
});
