import { query } from '../db.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from '../utils/http.js';

function readBearer(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

export async function optionalAuth(req, _res, next) {
  const token = readBearer(req);
  if (!token) {
    req.user = null;
    return next();
  }
  try {
    const payload = verifyAccessToken(token);
    const user = await query.get(
      'SELECT id, name, email, phone, avatar, city, rating, reviews_count, verified, role, created_at FROM users WHERE id = ?',
      [payload.sub],
    );
    req.user = user || null;
  } catch {
    req.user = null;
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'Требуется авторизация'));
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Требуется авторизация'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'Недостаточно прав'));
    next();
  };
}
