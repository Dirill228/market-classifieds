export function serializeUser(row, extra = {}) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || '',
    avatar: row.avatar || '',
    city: row.city || '',
    rating: row.rating,
    reviewsCount: row.reviews_count,
    verified: Boolean(row.verified),
    role: row.role,
    createdAt: row.created_at,
    ...extra,
  };
}

export function serializeMessage(row) {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    body: row.body,
    attachmentUrl: row.attachment_url || null,
    attachmentName: row.attachment_name || null,
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
  };
}

export function formatPrice(price) {
  return new Intl.NumberFormat('ru-RU').format(price);
}
