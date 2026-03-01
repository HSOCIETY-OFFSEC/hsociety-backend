/**
 * Secure cookie helpers for refresh token
 * SECURITY UPDATE IMPLEMENTED: HTTP-only, Secure, SameSite=strict
 */
const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_MAX_AGE_DAYS = 7;

export function setRefreshTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    maxAge: REFRESH_MAX_AGE_DAYS * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  });
}

export function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    path: '/api/auth',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
}

export function getRefreshTokenFromCookie(req) {
  return req.cookies?.[REFRESH_COOKIE_NAME] || null;
}

export { REFRESH_COOKIE_NAME };
