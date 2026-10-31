import multer from 'multer';
import { ApiError } from '../utils/http.js';
import { config } from '../config.js';

export function notFound(req, res) {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { message: 'Эндпоинт не найден' } });
  }
  return res.status(404).sendFile('404.html', { root: config.clientDir });
}

export function errorHandler(error, _req, res, _next) {
  if (error instanceof ApiError) {
    return res.status(error.status).json({
      error: { message: error.message, details: error.details },
    });
  }

  if (error instanceof multer.MulterError) {
    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Файл слишком большой. Максимум 5 МБ.'
      : 'Не удалось загрузить файл';
    return res.status(400).json({ error: { message } });
  }

  if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: { message: 'Запись уже существует' } });
  }

  console.error('[api error]', error);
  return res.status(500).json({
    error: { message: 'Внутренняя ошибка сервера. Попробуйте позже.' },
  });
}
