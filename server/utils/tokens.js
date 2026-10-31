import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, name: user.name },
    config.accessSecret,
    { expiresIn: config.accessTtl },
  );
}

export function signRefreshToken(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    config.refreshSecret,
    { expiresIn: `${config.refreshTtlDays}d` },
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.accessSecret);
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.refreshSecret);
}

export async function persistRefreshToken(userId, token) {
  const expires = new Date(Date.now() + config.refreshTtlDays * 86400_000).toISOString();
  await query.run(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [userId, hashToken(token), expires],
  );
}

export async function revokeRefreshToken(token) {
  await query.run('DELETE FROM refresh_tokens WHERE token_hash = ?', [hashToken(token)]);
}

export async function isRefreshTokenActive(token) {
  const row = await query.get(
    'SELECT id FROM refresh_tokens WHERE token_hash = ? AND expires_at > ?',
    [hashToken(token), new Date().toISOString()],
  );
  return Boolean(row);
}

export function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    path: '/api/auth',
    maxAge: config.refreshTtlDays * 86400_000,
  };
}

export function createRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}
