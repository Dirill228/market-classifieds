-- Схема базы данных «Маркет» (PostgreSQL)
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  name          TEXT    NOT NULL,
  email         TEXT    NOT NULL UNIQUE,
  password_hash TEXT    NOT NULL,
  phone         TEXT,
  avatar        TEXT,
  city          TEXT,
  rating        REAL    NOT NULL DEFAULT 0,
  reviews_count INTEGER NOT NULL DEFAULT 0,
  verified      INTEGER NOT NULL DEFAULT 0,
  role          TEXT    NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'moderator', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at  TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS locations (
  id     SERIAL PRIMARY KEY,
  name   TEXT NOT NULL,
  region TEXT,
  slug   TEXT NOT NULL UNIQUE,
  lat    DOUBLE PRECISION,
  lng    DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  icon        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS subcategories (
  id          SERIAL PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  UNIQUE (category_id, slug)
);

CREATE TABLE IF NOT EXISTS listings (
  id             SERIAL PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id    INTEGER NOT NULL REFERENCES categories(id),
  subcategory_id INTEGER REFERENCES subcategories(id),
  location_id    INTEGER NOT NULL REFERENCES locations(id),
  title          TEXT    NOT NULL,
  description    TEXT    NOT NULL,
  price          INTEGER NOT NULL CHECK (price >= 0),
  price_period   TEXT    NOT NULL DEFAULT '' CHECK (price_period IN ('', 'hour', 'day', 'month', 'm2')),
  condition      TEXT    NOT NULL DEFAULT 'used' CHECK (condition IN ('new', 'used')),
  seller_type    TEXT    NOT NULL DEFAULT 'private' CHECK (seller_type IN ('private', 'business')),
  delivery       INTEGER NOT NULL DEFAULT 0,
  negotiable     INTEGER NOT NULL DEFAULT 0,
  status         TEXT    NOT NULL DEFAULT 'moderation' CHECK (status IN ('active', 'moderation', 'rejected', 'sold', 'archived')),
  views          INTEGER NOT NULL DEFAULT 0,
  is_urgent      INTEGER NOT NULL DEFAULT 0,
  promoted_until TIMESTAMPTZ,
  address        TEXT,
  attributes     JSONB   NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listings_status_created ON listings(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_category ON listings(category_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_location ON listings(location_id, status);
CREATE INDEX IF NOT EXISTS idx_listings_price ON listings(price);
CREATE INDEX IF NOT EXISTS idx_listings_user ON listings(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS images (
  id         SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  url        TEXT    NOT NULL,
  alt        TEXT    NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_images_listing ON images(listing_id, sort_order);

CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, listing_id)
);

CREATE TABLE IF NOT EXISTS saved_searches (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT    NOT NULL,
  query_json TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversations (
  id              SERIAL PRIMARY KEY,
  listing_id      INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  buyer_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (listing_id, buyer_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_buyer ON conversations(buyer_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_seller ON conversations(seller_id, last_message_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  id              SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body            TEXT    NOT NULL DEFAULT '',
  attachment_url  TEXT,
  attachment_name TEXT,
  is_read         INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);

CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  author_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body       TEXT    NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id         SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason     TEXT    NOT NULL,
  comment    TEXT,
  status     TEXT    NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'rejected')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promotions (
  id         SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  type       TEXT    NOT NULL CHECK (type IN ('urgent', 'vip')),
  price      INTEGER NOT NULL DEFAULT 0,
  starts_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ends_at    TIMESTAMPTZ NOT NULL,
  status     TEXT    NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'pending'))
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS listing_views (
  id         SERIAL PRIMARY KEY,
  listing_id INTEGER NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
  day        TEXT    NOT NULL,
  count      INTEGER NOT NULL DEFAULT 0,
  UNIQUE (listing_id, day)
);

CREATE INDEX IF NOT EXISTS idx_listing_views_listing ON listing_views(listing_id, day);

CREATE TABLE IF NOT EXISTS contact_requests (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  topic      TEXT NOT NULL,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'processed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);