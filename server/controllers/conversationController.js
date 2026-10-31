import { query } from '../db.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { serializeMessage } from '../utils/serialize.js';
import { cleanString } from '../utils/validate.js';

const typingState = new Map();
const TYPING_TTL = 5000;

function markTyping(conversationId, userId) {
  if (!typingState.has(conversationId)) typingState.set(conversationId, new Map());
  typingState.get(conversationId).set(userId, Date.now());
}

function isTyping(conversationId, exceptUserId) {
  const users = typingState.get(conversationId);
  if (!users) return false;
  const now = Date.now();
  let typing = false;
  for (const [userId, at] of users.entries()) {
    if (now - at > TYPING_TTL) {
      users.delete(userId);
    } else if (userId !== exceptUserId) {
      typing = true;
    }
  }
  return typing;
}

async function getConversationOrThrow(id, userId) {
  const conversation = await query.get(
    'SELECT * FROM conversations WHERE id = ? AND (buyer_id = ? OR seller_id = ?)',
    [id, userId, userId],
  );
  if (!conversation) throw new ApiError(404, 'Диалог не найден');
  return conversation;
}

function serializeConversation(row, userId) {
  return {
    id: row.id,
    listing: {
      id: row.listing_id,
      title: row.listing_title,
      price: row.listing_price,
      status: row.listing_status,
      image: row.image_url || null,
    },
    counterpart: {
      id: row.counterpart_id,
      name: row.counterpart_name,
      avatar: row.counterpart_avatar,
      rating: row.counterpart_rating,
      verified: Boolean(row.counterpart_verified),
    },
    lastMessage: row.last_body || '',
    lastMessageAt: row.last_at,
    unread: row.unread,
    role: row.seller_id === userId ? 'seller' : 'buyer',
  };
}

export const listConversations = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const rows = await query.all(
    `SELECT c.*,
       l.title AS listing_title, l.price AS listing_price, l.status AS listing_status,
       li.url AS image_url,
       u.id AS counterpart_id, u.name AS counterpart_name, u.avatar AS counterpart_avatar,
       u.rating AS counterpart_rating, u.verified AS counterpart_verified,
       (SELECT body FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_body,
       (SELECT created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.id DESC LIMIT 1) AS last_at,
       (SELECT COUNT(*) FROM messages m
         WHERE m.conversation_id = c.id AND m.is_read = 0 AND m.sender_id != ?) AS unread
     FROM conversations c
     JOIN listings l ON l.id = c.listing_id
     JOIN users u ON u.id = CASE WHEN c.buyer_id = ? THEN c.seller_id ELSE c.buyer_id END
     LEFT JOIN images li ON li.listing_id = l.id AND li.sort_order = 0
     WHERE c.buyer_id = ? OR c.seller_id = ?
     ORDER BY c.last_message_at DESC`,
    [userId, userId, userId, userId],
  );
  res.json({ items: rows.map((row) => serializeConversation(row, userId)) });
});

export const createConversation = asyncHandler(async (req, res) => {
  const listingId = Number(req.body.listingId);
  if (!listingId) throw new ApiError(422, 'Не указано объявление');

  const listing = await query.get('SELECT id, user_id, status FROM listings WHERE id = ?', [listingId]);
  if (!listing) throw new ApiError(404, 'Объявление не найдено');
  if (listing.user_id === req.user.id) throw new ApiError(422, 'Это ваше собственное объявление');

  let conversation = await query.get(
    'SELECT * FROM conversations WHERE listing_id = ? AND buyer_id = ?',
    [listingId, req.user.id],
  );

  if (!conversation) {
    const result = await query.run(
      'INSERT INTO conversations (listing_id, buyer_id, seller_id) VALUES (?, ?, ?)',
      [listingId, req.user.id, listing.user_id],
    );
    conversation = await query.get('SELECT * FROM conversations WHERE id = ?', [result.lastInsertRowid]);
  }

  const text = cleanString(req.body.message, 2000);
  if (text) {
    const insert = await query.run(
      'INSERT INTO messages (conversation_id, sender_id, body) VALUES (?, ?, ?)',
      [conversation.id, req.user.id, text],
    );
    await query.run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [
      new Date().toISOString(),
      conversation.id,
    ]);
    res.status(201).json({ id: conversation.id, messageId: Number(insert.lastInsertRowid) });
    return;
  }

  res.status(201).json({ id: conversation.id });
});

export const getConversation = asyncHandler(async (req, res) => {
  const conversation = await getConversationOrThrow(Number(req.params.id), req.user.id);
  const listing = await query.get(
    `SELECT l.id, l.title, l.price, l.status, l.description, li.url AS image_url
     FROM listings l LEFT JOIN images li ON li.listing_id = l.id AND li.sort_order = 0
     WHERE l.id = ?`,
    [conversation.listing_id],
  );
  const counterpartId = conversation.seller_id === req.user.id ? conversation.buyer_id : conversation.seller_id;
  const counterpart = await query.get(
    'SELECT id, name, avatar, rating, reviews_count, verified FROM users WHERE id = ?',
    [counterpartId],
  );
  res.json({
    conversation: {
      id: conversation.id,
      listing: {
        id: listing.id,
        title: listing.title,
        price: listing.price,
        status: listing.status,
        image: listing.image_url,
      },
      counterpart: {
        id: counterpart.id,
        name: counterpart.name,
        avatar: counterpart.avatar,
        rating: counterpart.rating,
        reviewsCount: counterpart.reviews_count,
        verified: Boolean(counterpart.verified),
      },
      role: conversation.seller_id === req.user.id ? 'seller' : 'buyer',
    },
  });
});

export const getMessages = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id);
  await getConversationOrThrow(conversationId, req.user.id);
  const after = Number(req.query.after) || 0;
  const startedAt = Date.now();
  const initialTyping = isTyping(conversationId, req.user.id);

  const fetchMessages = () => query.all(
    'SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT 100',
    [conversationId, after],
  );

  let messages = await fetchMessages();
  let typing = initialTyping;

  // Долгое ожидание включаем только для инкрементальных запросов: первичная
  // загрузка истории должна отвечать сразу.
  while (after > 0 && !messages.length && typing === initialTyping && Date.now() - startedAt < 12000) {
    if (req.destroyed) return;
    await new Promise((resolve) => setTimeout(resolve, 900));
    messages = await fetchMessages();
    typing = isTyping(conversationId, req.user.id);
  }

  const otherUserRow = await query.get(
    'SELECT CASE WHEN buyer_id = ? THEN seller_id ELSE buyer_id END AS other FROM conversations WHERE id = ?',
    [req.user.id, conversationId],
  );
  const otherUserId = otherUserRow.other;

  res.json({
    messages: messages.map(serializeMessage),
    typing,
    otherUserId,
    serverTime: new Date().toISOString(),
  });
});

export const sendMessage = asyncHandler(async (req, res) => {
  const conversation = await getConversationOrThrow(Number(req.params.id), req.user.id);
  const body = cleanString(req.body.body, 2000);
  const attachmentUrl = cleanString(req.body.attachmentUrl, 300);
  const attachmentName = cleanString(req.body.attachmentName, 200);

  if (!body && !attachmentUrl) throw new ApiError(422, 'Сообщение не может быть пустым');

  const result = await query.run(
    `INSERT INTO messages (conversation_id, sender_id, body, attachment_url, attachment_name)
     VALUES (?, ?, ?, ?, ?)`,
    [conversation.id, req.user.id, body, attachmentUrl || null, attachmentName || null],
  );
  await query.run('UPDATE conversations SET last_message_at = ? WHERE id = ?', [
    new Date().toISOString(),
    conversation.id,
  ]);
  const message = await query.get('SELECT * FROM messages WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json({ message: serializeMessage(message) });
});

export const markRead = asyncHandler(async (req, res) => {
  const conversation = await getConversationOrThrow(Number(req.params.id), req.user.id);
  await query.run(
    'UPDATE messages SET is_read = 1 WHERE conversation_id = ? AND sender_id != ? AND is_read = 0',
    [conversation.id, req.user.id],
  );
  res.json({ ok: true });
});

export const setTyping = asyncHandler(async (req, res) => {
  const conversation = await getConversationOrThrow(Number(req.params.id), req.user.id);
  markTyping(conversation.id, req.user.id);
  res.json({ ok: true });
});

export const unreadCount = asyncHandler(async (req, res) => {
  const row = await query.get(
    `SELECT COUNT(*) AS count FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE m.is_read = 0 AND m.sender_id != ?
       AND (c.buyer_id = ? OR c.seller_id = ?)`,
    [req.user.id, req.user.id, req.user.id],
  );
  res.json({ unread: Number(row.count) });
});
