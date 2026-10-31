import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

const ALLOWED = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, config.uploadsDir),
  filename: (_req, file, cb) => {
    const ext = ALLOWED.get(file.mimetype) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
  },
});

function imageFilter(_req, file, cb) {
  if (!ALLOWED.has(file.mimetype)) {
    return cb(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'Допустимы только JPG, PNG и WebP'));
  }
  cb(null, true);
}

export const uploadListingImages = multer({
  storage,
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
}).array('images', 10);

export const uploadChatFile = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single('file');

export function publicUploadUrl(filename) {
  return `/uploads/${path.basename(filename)}`;
}
