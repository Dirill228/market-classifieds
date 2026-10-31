import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { query, transaction } from '../server/db.js';
import { demoListings } from './demo-listings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PASSWORD_HASH = '$2b$10$KLwTjJALF9GkylvN2pw0J.R4lKZs8L0WIOvRPOE69S8q6QqfDCRZK';

const USERS = [
  { id: 1,  name: 'Анна Смирнова',   email: 'demo@market.ru',      phone: '+7 (916) 204-18-73', avatar: 'anna.jpg',    city: 'Москва',           rating: 4.9, reviews: 38, verified: 1, daysAgo: 720 },
  { id: 2,  name: 'Сергей Ковалёв',  email: 'sergey@market.ru',    phone: '+7 (921) 771-06-24', avatar: 'sergey.jpg',  city: 'Санкт-Петербург',  rating: 4.7, reviews: 21, verified: 1, daysAgo: 940 },
  { id: 3,  name: 'Елена Морозова',  email: 'elena@market.ru',     phone: '+7 (917) 338-90-51', avatar: 'elena.jpg',   city: 'Казань',           rating: 4.8, reviews: 16, verified: 1, daysAgo: 610 },
  { id: 4,  name: 'Дмитрий Волков',  email: 'dmitry@market.ru',    phone: '+7 (912) 445-71-09', avatar: 'dmitry.jpg',  city: 'Екатеринбург',     rating: 4.5, reviews: 12, verified: 0, daysAgo: 430 },
  { id: 5,  name: 'Ольга Кузнецова', email: 'olga@market.ru',      phone: '+7 (903) 512-44-87', avatar: 'olga.jpg',    city: 'Новосибирск',      rating: 5.0, reviews: 9,  verified: 1, daysAgo: 380 },
  { id: 6,  name: 'Михаил Орлов',    email: 'mikhail@market.ru',   phone: '+7 (926) 180-63-32', avatar: 'mikhail.jpg', city: 'Краснодар',        rating: 4.6, reviews: 27, verified: 1, daysAgo: 1120 },
  { id: 7,  name: 'Ирина Лебедева',  email: 'irina@market.ru',     phone: '+7 (910) 227-85-60', avatar: 'irina.jpg',   city: 'Нижний Новгород',  rating: 4.9, reviews: 14, verified: 0, daysAgo: 290 },
  { id: 8,  name: 'Павел Никитин',   email: 'pavel@market.ru',     phone: '+7 (950) 904-12-38', avatar: 'pavel.jpg',   city: 'Сочи',             rating: 4.4, reviews: 7,  verified: 0, daysAgo: 210 },
  { id: 9,  name: 'Мария Фомина',    email: 'maria@market.ru',     phone: '+7 (911) 660-29-14', avatar: 'maria.jpg',   city: 'Самара',           rating: 4.8, reviews: 19, verified: 1, daysAgo: 860 },
  { id: 10, name: 'Алексей Тарасов', email: 'alexey@market.ru',    phone: '+7 (918) 377-51-02', avatar: 'alexey.jpg',  city: 'Ростов-на-Дону',   rating: 4.7, reviews: 23, verified: 1, daysAgo: 1340 },
  { id: 11, name: 'Наталья Белова',  email: 'natalia@market.ru',   phone: '+7 (927) 811-40-65', avatar: 'natalia.jpg', city: 'Уфа',              rating: 4.6, reviews: 11, verified: 0, daysAgo: 500 },
  { id: 12, name: 'Игорь Соколов',   email: 'igor@market.ru',      phone: '+7 (914) 502-77-93', avatar: 'igor.jpg',    city: 'Владивосток',      rating: 4.9, reviews: 31, verified: 1, daysAgo: 1480 },
];

const DAY = 86400_000;

function iso(daysAgo, hour = 12) {
  const date = new Date(Date.now() - daysAgo * DAY);
  date.setUTCHours(hour, 0, 0, 0);
  return date.toISOString();
}

async function insertUsers() {
  for (const user of USERS) {
    await query.run(
      `INSERT INTO users
        (id, name, email, password_hash, phone, avatar, city, rating, reviews_count, verified, role, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)
       ON CONFLICT DO NOTHING`,
      [
        user.id,
        user.name,
        user.email,
        PASSWORD_HASH,
        user.phone,
        `/assets/img/avatars/${user.avatar}`,
        user.city,
        user.rating,
        user.reviews,
        user.verified,
        iso(user.daysAgo),
        iso(0),
      ],
    );
  }
  await query.run("UPDATE users SET role = 'moderator' WHERE id = 12");
}

async function insertListings() {
  let created = 0;

  for (const [index, item] of demoListings.entries()) {
    const existing = await query.get('SELECT id FROM listings WHERE title = ? AND user_id = ?', [item.title, item.userId]);
    if (existing) continue;

    const createdAt = iso(item.daysAgo, item.hour ?? 11);
    const promotedUntil = item.vip ? new Date(Date.now() + 5 * DAY).toISOString() : null;
    const status = item.status || 'active';
    const subcategory = item.subcategorySlug
      ? await query.get('SELECT id FROM subcategories WHERE category_id = ? AND slug = ?', [item.categoryId, item.subcategorySlug])
      : null;

    const result = await query.run(
      `INSERT INTO listings (
        user_id, category_id, subcategory_id, location_id, title, description, price,
        price_period, condition, seller_type, delivery, negotiable, status, views,
        is_urgent, promoted_until, address, attributes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        item.userId,
        item.categoryId,
        subcategory?.id || null,
        item.locationId,
        item.title,
        item.description,
        item.price,
        item.pricePeriod || '',
        item.condition || 'used',
        item.sellerType || 'private',
        item.delivery ? 1 : 0,
        item.negotiable ? 1 : 0,
        status,
        item.views ?? 120 + index * 37,
        item.urgent ? 1 : 0,
        promotedUntil,
        item.address || '',
        JSON.stringify(item.attributes || {}),
        createdAt,
        createdAt,
      ],
    );

    const listingId = Number(result.lastInsertRowid);
    for (const [imageIndex, image] of item.images.entries()) {
      await query.run(
        'INSERT INTO images (listing_id, url, alt, sort_order) VALUES (?, ?, ?, ?)',
        [listingId, `/assets/img/listings/${image}`, item.title, imageIndex],
      );
    }

    if (item.urgent || item.vip) {
      await query.run(
        `INSERT INTO promotions (listing_id, type, price, starts_at, ends_at, status)
         VALUES (?, ?, ?, ?, ?, 'active')`,
        [
          listingId,
          item.vip ? 'vip' : 'urgent',
          item.vip ? 399 : 149,
          createdAt,
          new Date(Date.now() + 5 * DAY).toISOString(),
        ],
      );
    }

    created += 1;
  }

  console.log(`  добавлено объявлений: ${created}`);
}

async function insertViews() {
  const listings = await query.all("SELECT id, views, created_at FROM listings WHERE status = 'active'");
  for (const listing of listings) {
    let remaining = listing.views;
    const weights = [];
    for (let day = 0; day < 30; day += 1) {
      weights.push(1 + Math.sin((day / 30) * Math.PI) * 2 + (day % 7 === 0 ? 0.6 : 0));
    }
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    for (let day = 0; day < 30; day += 1) {
      const date = new Date(Date.now() - day * DAY).toISOString().slice(0, 10);
      const count = Math.max(0, Math.round((remaining * weights[day]) / totalWeight));
      if (!count) continue;
      await query.run(
        `INSERT INTO listing_views (listing_id, day, count) VALUES (?, ?, ?) ON CONFLICT DO NOTHING`,
        [listing.id, date, count],
      );
    }
  }
}

async function insertFavorites() {
  const pairs = [
    [1, 1], [1, 4], [1, 7], [1, 12], [1, 18],
    [2, 2], [2, 9], [2, 21], [3, 3], [3, 11], [3, 26],
    [4, 5], [4, 14], [5, 6], [5, 16], [6, 8], [7, 10], [8, 13],
  ];
  for (const [userId, listingId] of pairs) {
    const exists = await query.get('SELECT 1 AS ok FROM listings WHERE id = ?', [listingId]);
    if (!exists) continue;
    await query.run('INSERT INTO favorites (user_id, listing_id) VALUES (?, ?) ON CONFLICT DO NOTHING', [userId, listingId]);
  }
}

async function insertSavedSearches() {
  const searches = [
    [1, 'iPhone 15 Pro в Москве', { q: 'iPhone 15', category: 'electronics', location: 'moscow' }],
    [1, 'Квартиры до 15 млн', { category: 'realty', priceMax: 15000000, location: 'moscow', sort: 'date' }],
    [2, 'Ноутбуки для работы', { category: 'electronics', subcategory: 'laptops', sort: 'price_asc' }],
    [3, 'Щенки в Казани', { category: 'animals', subcategory: 'dogs', location: 'kazan' }],
  ];
  for (const [userId, title, searchQuery] of searches) {
    await query.run(
      'INSERT INTO saved_searches (user_id, title, query_json) VALUES (?, ?, ?)',
      [userId, title, JSON.stringify(searchQuery)],
    );
  }
}

async function insertConversations() {
  const dialogues = [
    {
      listingId: 1, buyerId: 1, sellerId: 2, daysAgo: 0.2,
      messages: [
        [2, 'Здравствуйте! Да, телефон в идеальном состоянии, покупал в сентябре. Комплект полный, чек сохранился.', 0.5],
        [1, 'Добрый день! Подскажите, аккумулятор родной? И торг возможен при встрече?', 0.45],
        [2, 'Аккумулятор родной, ёмкость 94%. Небольшой торг обсуждаем — приезжайте, посмотрите.', 0.4],
        [1, 'Отлично, смогу подъехать завтра после 18:00. Район метро Петроградская удобен?', 0.1],
      ],
    },
    {
      listingId: 4, buyerId: 1, sellerId: 3, daysAgo: 1.2,
      messages: [
        [1, 'Здравствуйте! Квартира ещё сдаётся? Интересует на длительный срок.', 1.1],
        [3, 'Добрый день! Да, сдаётся. Коммунальные платежи включены, кроме электричества.', 0.9],
        [3, 'Могу показать в субботу в первой половине дня. Вам удобно?', 0.85],
        [1, 'Суббота подходит, давайте в 11:00.', 0.3],
      ],
    },
    {
      listingId: 9, buyerId: 1, sellerId: 6, daysAgo: 2.4,
      messages: [
        [6, 'Добрый день! MacBook в наличии, могу отправить СДЭКом в день оплаты.', 2.3],
        [1, 'А гарантия сохранилась? Чек и коробка есть?', 2.1],
        [6, 'Да, гарантия до августа, чек и полный комплект на месте.', 2.0],
      ],
    },
    {
      listingId: 18, buyerId: 1, sellerId: 7, daysAgo: 3.6,
      messages: [
        [1, 'Здравствуйте! Диван ещё продаёте? Какие размеры?', 3.5],
        [7, 'Добрый! Да, продаём. 220×95 см, раскладывается в спальное место 200×150.', 3.2],
        [1, 'Спасибо, подумаю и напишу.', 3.0],
      ],
    },
    {
      listingId: 6, buyerId: 4, sellerId: 2, daysAgo: 0.6,
      messages: [
        [4, 'Добрый вечер! Готов забрать сегодня, если скидка 5%.', 0.55],
        [2, 'Здравствуйте. Могу отдать за 82 000, если заберёте сегодня до 21:00.', 0.5],
      ],
    },
  ];

  for (const dialogue of dialogues) {
    const listing = await query.get('SELECT id FROM listings WHERE id = ?', [dialogue.listingId]);
    if (!listing) continue;
    const existing = await query.get(
      'SELECT id FROM conversations WHERE listing_id = ? AND buyer_id = ?',
      [dialogue.listingId, dialogue.buyerId],
    );
    if (existing) continue;

    const lastDaysAgo = dialogue.messages[dialogue.messages.length - 1][2];
    const result = await query.run(
      'INSERT INTO conversations (listing_id, buyer_id, seller_id, created_at, last_message_at) VALUES (?, ?, ?, ?, ?)',
      [
        dialogue.listingId,
        dialogue.buyerId,
        dialogue.sellerId,
        iso(dialogue.daysAgo),
        iso(lastDaysAgo),
      ],
    );
    const conversationId = Number(result.lastInsertRowid);

    for (const [senderId, body, messageDaysAgo] of dialogue.messages) {
      await query.run(
        'INSERT INTO messages (conversation_id, sender_id, body, is_read, created_at) VALUES (?, ?, ?, ?, ?)',
        [conversationId, senderId, body, senderId === dialogue.buyerId ? 1 : 0, iso(messageDaysAgo)],
      );
    }
  }
}

async function insertReviews() {
  const reviews = [
    [2, 1, 5, 'Продал телефон быстро и без лишних вопросов. Приятно иметь дело: всё показал, честно рассказал о состоянии.', 40],
    [3, 1, 5, 'Арендовали квартиру через «Маркет». Анна помогла с документами и не подняла цену перед сделкой.', 75],
    [6, 1, 4, 'Хороший продавец, отвечает оперативно. Немного задержалась встреча, но предупредила заранее.', 120],
    [1, 2, 5, 'Купил смартфон — состояние как на фото, комплект полный. Рекомендую.', 30],
    [4, 2, 5, 'Быстрая доставка, упаковано аккуратно. Спасибо!', 95],
    [1, 3, 5, 'Квартира соответствует описанию, хозяйка очень внимательная.', 60],
    [5, 3, 4, 'Всё прошло хорошо, небольшая задержка с договором.', 150],
    [1, 6, 5, 'Ноутбук в отличном состоянии, помог с настройкой.', 25],
    [9, 6, 5, 'Профессиональный подход к продаже техники.', 210],
    [1, 7, 5, 'Диван как новый, доставили в срок.', 180],
    [3, 9, 5, 'Репетитор отличный, ребёнок стал увереннее в математике.', 45],
    [5, 10, 4, 'Аккуратная бригада, убрали за собой. Цена немного выше средней.', 70],
  ];
  for (const [authorId, sellerId, rating, body, daysAgo] of reviews) {
    await query.run(
      'INSERT INTO reviews (author_id, seller_id, rating, body, created_at) VALUES (?, ?, ?, ?, ?)',
      [authorId, sellerId, rating, body, iso(daysAgo)],
    );
  }
}

export async function seed() {
  console.log('Наполняю базу демонстрационными данными…');
  const seedsSql = fs.readFileSync(path.join(__dirname, 'seeds.sql'), 'utf8');

  await transaction(async () => {
    await query.exec(seedsSql);
    await insertUsers();
    await insertListings();
    await insertViews();
    await insertFavorites();
    await insertSavedSearches();
    await insertConversations();
    await insertReviews();
  });

  const totals = {
    users: (await query.get('SELECT COUNT(*) AS count FROM users')).count,
    listings: (await query.get('SELECT COUNT(*) AS count FROM listings')).count,
    images: (await query.get('SELECT COUNT(*) AS count FROM images')).count,
    conversations: (await query.get('SELECT COUNT(*) AS count FROM conversations')).count,
  };
  console.log('Готово:', totals);
  return totals;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seed().catch((error) => {
    console.error('Ошибка наполнения базы:', error);
    process.exit(1);
  });
}
