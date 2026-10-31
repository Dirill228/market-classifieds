import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');

export const config = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/market',
  clientDir: path.join(ROOT_DIR, 'client'),
  uploadsDir: path.join(__dirname, 'uploads'),
  accessSecret: process.env.JWT_SECRET || 'market-demo-access-secret-change-me',
  refreshSecret: process.env.JWT_REFRESH_SECRET || 'market-demo-refresh-secret-change-me',
  accessTtl: process.env.ACCESS_TTL || '15m',
  refreshTtlDays: Number(process.env.REFRESH_TTL_DAYS || 30),
  isProduction: (process.env.NODE_ENV || 'development') === 'production',
  demoMode: process.env.DEMO_MODE !== 'false',
};