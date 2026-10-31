import bcrypt from 'bcryptjs';
import { query } from '../db.js';
import { ApiError, asyncHandler } from '../utils/http.js';
import { serializeUser } from '../utils/serialize.js';
import { cleanString, validateRegistration } from '../utils/validate.js';
import {
  createRandomToken,
  hashToken,
  isRefreshTokenActive,
  persistRefreshToken,
  refreshCookieOptions,
  revokeRefreshToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';
import { config } from '../config.js';

const USER_FIELDS = 'id, name, email, phone, avatar, city, rating, reviews_count, verified, role, created_at';

async function issueSession(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  await persistRefreshToken(user.id, refreshToken);
  res.cookie('refresh_token', refreshToken, refreshCookieOptions());
  return { accessToken, user: serializeUser(user) };
}

export const register = asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name, 60);
  const email = cleanString(req.body.email, 120).toLowerCase();
  const phone = cleanString(req.body.phone, 20);
  const password = String(req.body.password || '');

  validateRegistration({ name, email, password, phone });

  const existing = await query.get('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) throw new ApiError(409, 'Пользователь с таким e-mail уже зарегистрирован');

  const passwordHash = await bcrypt.hash(password, 10);
  const result = await query.run(
    `INSERT INTO users (name, email, password_hash, phone, avatar, city, verified, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
    [name, email, passwordHash, phone, '', cleanString(req.body.city, 80), new Date().toISOString()],
  );

  const user = await query.get(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [result.lastInsertRowid]);
  const session = await issueSession(res, user);
  res.status(201).json(session);
});

export const login = asyncHandler(async (req, res) => {
  const email = cleanString(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) throw new ApiError(422, 'Введите e-mail и пароль');

  const user = await query.get('SELECT * FROM users WHERE email = ?', [email]);
  if (!user) throw new ApiError(401, 'Неверный e-mail или пароль');

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) throw new ApiError(401, 'Неверный e-mail или пароль');

  await query.run('UPDATE users SET last_seen_at = ? WHERE id = ?', [new Date().toISOString(), user.id]);
  res.json(await issueSession(res, user));
});

export const refresh = asyncHandler(async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (!token) throw new ApiError(401, 'Сессия истекла');

  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    res.clearCookie('refresh_token', refreshCookieOptions());
    throw new ApiError(401, 'Сессия истекла');
  }

  if (!(await isRefreshTokenActive(token))) {
    res.clearCookie('refresh_token', refreshCookieOptions());
    throw new ApiError(401, 'Сессия истекла');
  }

  const user = await query.get(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [payload.sub]);
  if (!user) throw new ApiError(401, 'Пользователь не найден');

  await revokeRefreshToken(token);
  res.json(await issueSession(res, user));
});

export const logout = asyncHandler(async (req, res) => {
  const token = req.cookies?.refresh_token;
  if (token) await revokeRefreshToken(token);
  res.clearCookie('refresh_token', refreshCookieOptions());
  res.json({ ok: true });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: serializeUser(req.user) });
});

export const updateMe = asyncHandler(async (req, res) => {
  const name = cleanString(req.body.name, 60);
  const phone = cleanString(req.body.phone, 20);
  const city = cleanString(req.body.city, 80);
  const avatar = cleanString(req.body.avatar, 300);

  if (name && name.length < 2) throw new ApiError(422, 'Имя слишком короткое');
  if (phone && !/^\+?[0-9\s()-]{10,18}$/.test(phone)) {
    throw new ApiError(422, 'Укажите корректный телефон');
  }

  await query.run(
    `UPDATE users SET
       name = COALESCE(NULLIF(?, ''), name),
       phone = ?,
       city = ?,
       avatar = COALESCE(NULLIF(?, ''), avatar)
     WHERE id = ?`,
    [name, phone, city, avatar, req.user.id],
  );

  const user = await query.get(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [req.user.id]);
  res.json({ user: serializeUser(user) });
});

export const changePassword = asyncHandler(async (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (next.length < 8) throw new ApiError(422, 'Новый пароль должен быть не короче 8 символов');

  const user = await query.get('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  const valid = await bcrypt.compare(current, user.password_hash);
  if (!valid) throw new ApiError(422, 'Текущий пароль указан неверно');

  const passwordHash = await bcrypt.hash(next, 10);
  await query.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.user.id]);
  await query.run('DELETE FROM refresh_tokens WHERE user_id = ?', [req.user.id]);
  res.json({ ok: true, message: 'Пароль обновлён. Войдите заново.' });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const email = cleanString(req.body.email, 120).toLowerCase();
  if (!email) throw new ApiError(422, 'Укажите e-mail');

  const user = await query.get('SELECT id FROM users WHERE email = ?', [email]);
  const response = {
    ok: true,
    message: 'Если аккаунт существует, мы отправили письмо со ссылкой для сброса пароля.',
  };

  if (user) {
    const token = createRandomToken(24);
    const expiresAt = new Date(Date.now() + 60 * 60_000).toISOString();
    await query.run(
      'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [user.id, hashToken(token), expiresAt],
    );
    if (config.demoMode) {
      response.demoResetToken = token;
      response.message = 'Демо-режим: используйте код из ответа, чтобы задать новый пароль.';
    }
  }

  res.json(response);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const token = cleanString(req.body.token, 200);
  const password = String(req.body.password || '');
  if (!token) throw new ApiError(422, 'Укажите код сброса');
  if (password.length < 8) throw new ApiError(422, 'Пароль должен быть не короче 8 символов');

  const reset = await query.get(
    'SELECT * FROM password_resets WHERE token_hash = ? AND used = 0 AND expires_at > ?',
    [hashToken(token), new Date().toISOString()],
  );
  if (!reset) throw new ApiError(422, 'Код недействителен или истёк');

  const passwordHash = await bcrypt.hash(password, 10);
  await query.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, reset.user_id]);
  await query.run('UPDATE password_resets SET used = 1 WHERE id = ?', [reset.id]);
  await query.run('DELETE FROM refresh_tokens WHERE user_id = ?', [reset.user_id]);

  res.json({ ok: true, message: 'Пароль изменён. Теперь можно войти.' });
});
