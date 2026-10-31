import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { config } from './config.js';
import { isSeeded, initDb } from './db.js';
import { seed } from '../db/seed.js';
import apiRoutes from './routes/api.js';
import { optionalAuth } from './middlewares/auth.js';
import { csrfProtection } from './middlewares/csrf.js';
import { rateLimit } from './middlewares/rateLimit.js';
import { errorHandler, notFound } from './middlewares/errors.js';

await initDb();

if (!(await isSeeded())) {
  console.log('База пуста — наполняю демонстрационными данными…');
  await seed();
}

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "img-src 'self' data: blob:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self'",
      "font-src 'self'",
      "connect-src 'self'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; '),
  );
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());

app.use('/uploads', express.static(config.uploadsDir, { maxAge: '7d', immutable: true }));
app.use(
  '/assets',
  express.static(path.join(config.clientDir, 'assets'), { maxAge: '7d' }),
);
app.use(
  '/api',
  rateLimit({ windowMs: 60_000, max: 300, name: 'api' }),
  csrfProtection,
  optionalAuth,
  apiRoutes,
);

app.use(
  express.static(config.clientDir, {
    extensions: ['html'],
    maxAge: config.isProduction ? '1h' : 0,
  }),
);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  console.log(`\n  Маркет запущен: http://localhost:${config.port}`);
  console.log(`  Демо-аккаунт: demo@market.ru / demo1234\n`);
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

export default app;
