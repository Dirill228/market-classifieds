// Smoke-тест API: проверяет, что сервер поднялся и основные эндпоинты отвечают.
// Запуск: npm run test:api (сервер должен быть уже запущен) либо node scripts/smoke-api.js

const BASE = process.env.API_BASE || 'http://localhost:3000';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const jar = new Map();

function saveCookies(response) {
  const raw = response.headers.getSetCookie?.() || [];
  for (const cookie of raw) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (index > 0) jar.set(pair.slice(0, index).trim(), pair.slice(index + 1).trim());
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
}

async function request(path, { method = 'GET', body, token, csrf = true } = {}) {
  const headers = { Accept: 'application/json' };
  if (jar.size) headers.Cookie = cookieHeader();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (method !== 'GET' && csrf && jar.get('csrf_token')) {
    headers['X-CSRF-Token'] = jar.get('csrf_token');
  }
  let payload;
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const response = await fetch(`${BASE}${path}`, { method, headers, body: payload });
  saveCookies(response);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : await response.text();
  return { status: response.status, data };
}

async function main() {
  console.log(`\nПроверяю API по адресу ${BASE}\n`);

  // 1. Служебные эндпоинты и получение CSRF-cookie
  const health = await request('/api/health');
  check('GET /api/health → 200', health.status === 200, `код ${health.status}`);
  check('health.status = ok', health.data?.status === 'ok');
  check('CSRF-cookie установлен', jar.has('csrf_token'));

  const config = await request('/api/config');
  check('GET /api/config → 200', config.status === 200);
  check('демо-режим включён', config.data?.demoMode === true);

  // 2. Каталог
  const categories = await request('/api/categories');
  check('GET /api/categories → 200', categories.status === 200);
  check('12 категорий', categories.data?.categories?.length === 12, `получено ${categories.data?.categories?.length}`);
  check('у категорий есть счётчики', typeof categories.data?.categories?.[0]?.count === 'number');

  const locations = await request('/api/locations');
  check('GET /api/locations → 200', locations.status === 200);
  check('города загружены', (locations.data?.locations?.length || 0) >= 12);

  const home = await request('/api/home');
  check('GET /api/home → 200', home.status === 200);
  check('рекомендации не пустые', (home.data?.recommended?.length || 0) > 0);
  check('срочные объявления есть', (home.data?.urgent?.length || 0) > 0);
  check('статистика посчитана', typeof home.data?.stats?.listings === 'number');

  const list = await request('/api/listings?perPage=5');
  check('GET /api/listings → 200', list.status === 200);
  check('пагинация возвращает 5 элементов', list.data?.items?.length === 5);
  check('pagination.total > 0', list.data?.pagination?.total > 0);

  const filtered = await request('/api/listings?category=electronics&perPage=24');
  check('фильтр по категории работает', filtered.data?.items?.every((item) => item.category.slug === 'electronics'));

  const priced = await request('/api/listings?priceMax=20000&perPage=24');
  check('фильтр по цене работает', priced.data?.items?.every((item) => item.price <= 20000));

  const sorted = await request('/api/listings?sort=price_asc&perPage=6');
  const prices = sorted.data?.items?.map((item) => item.price) || [];
  check('сортировка по возрастанию цены', prices.every((price, index) => index === 0 || prices[index - 1] <= price));

  const search = await request('/api/listings?q=iphone');
  check('поиск по тексту работает', (search.data?.items?.length || 0) > 0);

  const suggest = await request('/api/suggest?q=iph');
  check('GET /api/suggest → 200', suggest.status === 200);
  check('подсказки не пустые', (suggest.data?.suggestions?.length || 0) > 0);

  // 3. Объявление
  const firstId = list.data?.items?.[0]?.id;
  const listing = await request(`/api/listings/${firstId}`);
  check('GET /api/listings/:id → 200', listing.status === 200);
  check('у объявления есть продавец', Boolean(listing.data?.listing?.seller?.name));
  check('у объявления есть изображения', (listing.data?.listing?.images?.length || 0) > 0);

  const similar = await request(`/api/listings/${firstId}/similar`);
  check('GET /api/listings/:id/similar → 200', similar.status === 200);
  check('похожие объявления есть', (similar.data?.items?.length || 0) > 0);

  const phone = await request(`/api/listings/${firstId}/phone`);
  check('GET /api/listings/:id/phone → 200', phone.status === 200);
  check('телефон возвращается', Boolean(phone.data?.phone));

  const missing = await request('/api/listings/999999');
  check('несуществующее объявление → 404', missing.status === 404);

  // 4. Защита без авторизации
  const protectedCall = await request('/api/favorites');
  check('GET /api/favorites без токена → 401', protectedCall.status === 401);

  const noCsrf = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@market.ru', password: 'demo1234' },
    csrf: false,
  });
  check('POST без CSRF-заголовка → 403', noCsrf.status === 403, `код ${noCsrf.status}`);

  // 5. Авторизация
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@market.ru', password: 'demo1234' },
  });
  check('POST /api/auth/login → 200', login.status === 200, `код ${login.status}: ${JSON.stringify(login.data).slice(0, 120)}`);
  const token = login.data?.accessToken;
  check('accessToken получен', Boolean(token));
  check('профиль вернулся', login.data?.user?.email === 'demo@market.ru');

  const badLogin = await request('/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@market.ru', password: 'wrong-password' },
  });
  check('неверный пароль → 401', badLogin.status === 401);

  const me = await request('/api/auth/me', { token });
  check('GET /api/auth/me → 200', me.status === 200);

  // 6. Профиль, избранное, поиски
  const stats = await request('/api/profile/stats', { token });
  check('GET /api/profile/stats → 200', stats.status === 200);
  check('график за 30 дней', stats.data?.viewsSeries?.length === 30);

  const balance = await request('/api/profile/balance', { token });
  check('GET /api/profile/balance → 200', balance.status === 200);

  const mine = await request('/api/listings/mine', { token });
  check('GET /api/listings/mine → 200', mine.status === 200);

  const favorites = await request('/api/favorites', { token });
  check('GET /api/favorites → 200', favorites.status === 200);

  const addFavorite = await request('/api/favorites', { method: 'POST', body: { listingId: firstId }, token });
  check('POST /api/favorites → 201', addFavorite.status === 201 || addFavorite.status === 200);

  const removeFavorite = await request(`/api/favorites/${firstId}`, { method: 'DELETE', token });
  check('DELETE /api/favorites/:id → 200', removeFavorite.status === 200);

  const savedSearches = await request('/api/saved-searches', { token });
  check('GET /api/saved-searches → 200', savedSearches.status === 200);

  // 7. Чат
  const conversations = await request('/api/conversations', { token });
  check('GET /api/conversations → 200', conversations.status === 200);
  check('диалоги загружены', (conversations.data?.items?.length || 0) > 0);

  const conversationId = conversations.data?.items?.[0]?.id;
  const messages = await request(`/api/conversations/${conversationId}/messages`, { token });
  check('GET /api/conversations/:id/messages → 200', messages.status === 200);
  check('сообщения загружены', (messages.data?.messages?.length || 0) > 0);

  const unread = await request('/api/messages/unread-count', { token });
  check('GET /api/messages/unread-count → 200', unread.status === 200);

  // 8. Контент и обратная связь
  const faq = await request('/api/faq');
  check('GET /api/faq → 200', faq.status === 200);
  check('FAQ содержит группы', (faq.data?.groups?.length || 0) >= 3);

  const contact = await request('/api/contact', {
    method: 'POST',
    body: {
      name: 'Тестовый Пользователь',
      email: 'smoke@market.ru',
      topic: 'Общий вопрос',
      message: 'Проверка формы обратной связи из smoke-теста, не отвечайте.',
    },
  });
  check('POST /api/contact → 201', contact.status === 201, `код ${contact.status}`);

  const shortContact = await request('/api/contact', {
    method: 'POST',
    body: { name: 'Тест', email: 'smoke@market.ru', topic: 'Общий вопрос', message: 'мало' },
  });
  check('короткое сообщение отклонено → 422', shortContact.status === 422);

  // 9. Валидация публикации
  const invalidListing = await request('/api/listings', {
    method: 'POST',
    body: { title: 'short', description: 'too short', price: -5 },
    token,
  });
  check('невалидное объявление → 422', invalidListing.status === 422, `код ${invalidListing.status}`);
  check('ошибки по полям возвращаются', Boolean(invalidListing.data?.error?.details?.title));

  // 10. Выход
  const logout = await request('/api/auth/logout', { method: 'POST', token });
  check('POST /api/auth/logout → 200', logout.status === 200);

  // 11. Статика
  for (const page of ['/', '/index.html', '/catalog.html', '/listing.html', '/create.html', '/profile.html', '/messages.html', '/about.html', '/404.html']) {
    const response = await fetch(`${BASE}${page}`);
    check(`страница ${page} отдаётся (200)`, response.status === 200, `код ${response.status}`);
  }

  for (const asset of ['/css/theme.css', '/css/main.css', '/css/components.css', '/css/pages.css', '/js/api.js', '/js/home.js', '/assets/icons/favicon.svg']) {
    const response = await fetch(`${BASE}${asset}`);
    check(`ассет ${asset} доступен`, response.status === 200, `код ${response.status}`);
  }

  console.log(`\nИтого: ${passed} успешно, ${failed} с ошибкой\n`);
  if (failed) {
    console.log('Проваленные проверки:');
    failures.forEach((item) => console.log(`  · ${item}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('\nТест не смог выполниться:', error.message);
  console.error('Убедитесь, что сервер запущен: npm start');
  process.exitCode = 1;
});
