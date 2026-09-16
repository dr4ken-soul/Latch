/**
 * Fixed-window in-memory rate limiter, keyed by IP. Sufficient for the
 * demo routes' V1 limits (10/min and 30/min per IP per APP_BLUEPRINT);
 * a multi-instance deployment would move this to shared storage.
 */
const windows = new Map<string, { count: number; resetAt: number }>();

/**
 * Consume one request from `key`'s window. Returns true when the request is
 * allowed, false when the caller is over `limit` requests per `windowMs`.
 */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = windows.get(key);
  if (!entry || entry.resetAt <= now) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) {
    return false;
  }
  entry.count += 1;
  return true;
}

/** Derive a stable client key from request headers. */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') || 'local';
}
