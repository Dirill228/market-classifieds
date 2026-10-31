# Маркет — классифайд-платформа

Учебный проект: полнофункциональный клон Avito с клиент-серверной архитектурой.
Клиент — статический HTML/CSS/JS без фреймворков, сервер — Express + SQLite (встроенный
`node:sqlite`), аутентификация на JWT с refresh-cookie.

## Быстрый старт

```bash
npm install
npm start          # http://localhost:3000
```

При первом запуске база создаётся и наполняется демо-данными автоматически
(12 пользователей, 40 объявлений, 5 диалогов, отзывы, статистика просмотров).

**Демо-аккаунт:** `demo@market.ru` / `demo1234`

Другие полезные команды:

```bash
npm run dev        # запуск с --watch
npm run seed       # пересоздать демо-данные
npm run test:api   # smoke-тест API (нужен запущенный сервер)
```

## Стек

| Слой | Технологии |
| --- | --- |
| Клиент | HTML5, CSS3 (кастомная дизайн-система), Vanilla JS (ES-модули) |
| Сервер | Node.js 22+, Express 4, multer |
| БД | SQLite (`node:sqlite`), WAL-режим, внешние ключи |
| Аутентификация | JWT access-token (15 мин) + refresh-token в httpOnly-cookie (30 дней), bcrypt |
| Безопасность | CSRF-токен, rate limiting, CSP, валидация на клиенте и сервере |

## Страницы

| Файл | Назначение |
| --- | --- |
| `client/index.html` | Главная: hero с автокомплитом, 12 категорий, карусель рекомендаций, срочные объявления с таймером, SEO-блок |
| `client/catalog.html` | Каталог: sticky-фильтры, двойной ползунок цены, сортировка, пагинация, «Показать ещё», сохранение поиска |
| `client/listing.html` | Объявление: галерея с лайтбоксом, характеристики, карта, блок продавца, похожие, жалоба |
| `client/create.html` | Подача: мастер из трёх шагов, drag & drop фото, живой предпросмотр, тарифы |
| `client/profile.html` | Кабинет: таблица объявлений со статусами, график просмотров за 30 дней, избранное, баланс, настройки |
| `client/messages.html` | Чат: список диалогов, long-polling, индикатор набора, вложения |
| `client/about.html` | О компании: цифры с count-up, FAQ-аккордеон, форма обратной связи, реквизиты |
| `client/404.html` | Страница ошибки |

## Структура

```
client/
  css/        theme.css (токены), main.css (каркас), components.css, pages.css
  js/         api.js, auth.js, ui.js, icons.js, layout.js + скрипты страниц
  assets/     шрифты Inter/Manrope, изображения объявлений и аватары, favicon
server/
  routes/     api.js, auth.js, listings.js
  controllers/ auth, catalog, listing, favorite, profile, conversation, user, misc
  models/     listingModel.js (поиск, фильтры, сериализация)
  middlewares/ auth, csrf, rateLimit, errors
  utils/      tokens, upload, validate, serialize, http
  server.js   точка входа
db/
  schema.sql  схема (14 таблиц + индексы)
  seeds.sql   справочники: категории, подкатегории, города
  demo-listings.js  демо-каталог (40 объявлений)
  seed.js     наполнение базы
scripts/
  smoke-api.js  интеграционная проверка API и статики
```

## API

Все ответы — JSON. Ошибки в формате `{ error: { message, details? } }`.

### Публичные

| Метод | Путь | Описание |
| --- | --- | --- |
| GET | `/api/health` | состояние сервиса |
| GET | `/api/config` | демо-режим и версия |
| GET | `/api/home` | главная: категории, рекомендации, срочные, статистика |
| GET | `/api/categories` | категории с подкатегориями и счётчиками |
| GET | `/api/locations` | города с количеством объявлений |
| GET | `/api/suggest?q=` | автокомплит категорий и объявлений |
| GET | `/api/listings` | поиск: `q, category, subcategory, location, priceMin, priceMax, condition, sellerType, delivery, urgent, sellerId, sort, page, perPage` |
| GET | `/api/listings/:id` | объявление + статистика продавца |
| GET | `/api/listings/:id/similar` | похожие |
| GET | `/api/listings/:id/phone` | телефон продавца |
| GET | `/api/faq` | FAQ по группам |
| POST | `/api/contact` | обращение в поддержку |

### Требуют авторизации (`Authorization: Bearer <token>`)

| Метод | Путь | Описание |
| --- | --- | --- |
| POST | `/api/auth/register` / `login` / `logout` / `refresh` | сессия |
| GET/PATCH | `/api/auth/me` | профиль |
| POST | `/api/auth/me/password` | смена пароля |
| POST | `/api/auth/forgot-password` / `reset-password` | восстановление |
| GET | `/api/listings/mine` | мои объявления |
| POST | `/api/listings` | создать (multipart, до 10 фото) |
| PATCH/DELETE | `/api/listings/:id` | изменить / удалить |
| PATCH | `/api/listings/:id/status` | активное / продано / архив |
| POST | `/api/listings/:id/report` | жалоба |
| GET/POST/DELETE | `/api/favorites` | избранное |
| GET/POST/DELETE | `/api/saved-searches` | сохранённые поиски |
| GET | `/api/profile/stats` / `balance` | статистика и баланс |
| GET | `/api/conversations` | список диалогов |
| POST | `/api/conversations` | начать диалог по объявлению |
| GET | `/api/conversations/:id/messages?after=` | long-polling сообщений (до 12 с) |
| POST | `/api/conversations/:id/messages` | отправить сообщение |
| POST | `/api/conversations/:id/read` / `typing` | прочитано / набор текста |
| POST | `/api/uploads/chat` | вложение в чат |

Модерация (роль `moderator`/`admin`): `GET /api/moderation/reports`, `PATCH /api/moderation/reports/:id`,
`PATCH /api/moderation/listings/:id`.

## Схема БД

`users`, `locations`, `categories`, `subcategories`, `listings`, `images`, `favorites`,
`saved_searches`, `conversations`, `messages`, `reviews`, `reports`, `promotions`,
`refresh_tokens`, `password_resets`, `listing_views`, `contact_requests`.

## Дизайн-система

- Палитра: глубокий синий `#0A2540`, акцент `#FF6B35` (точечно), фон `#F7F8FA`.
- Типографика: Manrope (заголовки, 700/800, tracking −0.02em), Inter (текст).
- Радиусы: 12px карточки, 8px кнопки, 100px пилюли. Тени только мягкие многослойные.
- Сетка отступов 8px, hover-анимации 140–250 мс с `ease-out`.
- Иконки — собственный набор SVG в стиле Lucide (`client/js/icons.js`), без emoji.
- Тёмная тема с сохранением в `localStorage`, кастомный скроллбар, скелетоны, тултипы.
- Адаптив: 1440 / 1024 / 768 / 480, на мобильных — нижняя навигация.

## Безопасность

- Пароли — bcrypt (10 раундов), refresh-токены хранятся в виде SHA-256-хешей.
- CSRF: double-submit cookie `csrf_token` + заголовок `X-CSRF-Token` для небезопасных методов.
- Rate limiting: 300 req/min на API, 40 попыток входа за 15 минут, 30 публикаций в час.
- CSP, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`; загрузка только JPG/PNG/WebP до 5 МБ.
- Валидация всех форм на клиенте и сервере, экранирование HTML при рендере.

## Ограничения демо

- SQLite вместо PostgreSQL и in-memory Map вместо Redis — для запуска без внешних сервисов.
- Чат реализован через long-polling, не через WebSocket.
- Оплата продвижения имитируется: баланс и транзакции рассчитываются из таблицы `promotions`.
- Данные, реквизиты и контакты вымышлены; проект создан в учебных целях.
