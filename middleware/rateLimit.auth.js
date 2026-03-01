/**
 * Stricter rate limiting for auth routes
 * SECURITY UPDATE IMPLEMENTED: 5 login/OTP/password-reset per 15 min per IP
 */
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_AUTH_ATTEMPTS = 5;
const MAX_OTP_ATTEMPTS = 5;
const buckets = new Map();

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || req.ip || '';
}

function getBucket(key) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now - b.startedAt > WINDOW_MS) {
    const newB = { count: 0, startedAt: now };
    buckets.set(key, newB);
    return newB;
  }
  return b;
}

export function authRateLimit(req, res, next) {
  const ip = getClientIp(req);
  const path = req.path || '';
  const isLogin = path.includes('/login');
  const isOtp = path.includes('/otp/');
  const isPasswordReset = path.includes('password-reset') || path.includes('change-password');
  const key = `auth:${ip}:${isLogin ? 'login' : isOtp ? 'otp' : isPasswordReset ? 'pwd' : 'auth'}`;
  const bucket = getBucket(key);
  const limit = isLogin || isOtp ? MAX_AUTH_ATTEMPTS : MAX_OTP_ATTEMPTS;
  bucket.count += 1;
  if (bucket.count > limit) {
    res.setHeader('Retry-After', String(Math.ceil(WINDOW_MS / 1000)));
    return res.status(429).json({ error: 'Too many attempts. Try again later.' });
  }
  next();
}

export default authRateLimit;
