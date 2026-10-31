export class ApiError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function sendError(res, status, message, details = null) {
  res.status(status).json({ error: { message, details } });
}

export function toInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
