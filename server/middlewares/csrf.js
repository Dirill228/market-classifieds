import crypto from 'node:crypto';
import { config } from '../config.js';

const COOKIE_NAME = 'csrf_token';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req, res, next) {
  let token = req.cookies?.[COOKIE_NAME];
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie(COOKIE_NAME, token, {
      httpOnly: false,
      sameSite: 'lax',
      secure: config.isProduction,
      path: '/',
      maxAge: 7 * 86400_000,
    });
  }

  if (SAFE_METHODS.has(req.method)) return next();

  const header = req.get('x-csrf-token');
  if (!header || header !== token) {
    return res.status(403).json({
      error: { message: 'CSRF-токен отсутствует или недействителен. Обновите страницу.' },
    });
  }
  next();
}
