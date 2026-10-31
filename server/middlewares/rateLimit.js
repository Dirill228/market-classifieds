const buckets = new Map();

function clientKey(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

export function rateLimit({ windowMs = 60_000, max = 120, name = 'default', message } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${clientKey(req)}`;
    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.set('X-RateLimit-Limit', String(max));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > max) {
      const retryAfter = Math.ceil((bucket.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          message: message || `Слишком много запросов. Попробуйте через ${retryAfter} с.`,
        },
      });
    }
    next();
  };
}

const cleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets.entries()) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}, 5 * 60_000);
cleanup.unref?.();
