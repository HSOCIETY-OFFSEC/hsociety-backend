/**
 * Auth Routes
 * Matches frontend API_ENDPOINTS.AUTH
 * SECURITY UPDATE IMPLEMENTED: Refresh in cookie, logout invalidate, change-password, logging
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import * as authService from '../services/auth.service.js';
import * as twoFAService from '../services/twofa.service.js';
import { SecurityEvent } from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { setRefreshTokenCookie, clearRefreshTokenCookie, getRefreshTokenFromCookie } from '../utils/cookies.js';
import { authRateLimit } from '../middleware/rateLimit.auth.js';
import { validateLogin, validateRegister } from '../middleware/validate.auth.js';

const router = Router();
// Rate limit on auth routes
router.use(authRateLimit);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

const requestMeta = (req) => ({
  userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
  ipAddress: req.requestContext?.ipAddress || req.ip || '',
});

// POST /auth/register - SECURITY UPDATE IMPLEMENTED: Joi validation
router.post('/register', validateRegister, async (req, res, next) => {
  try {
    const result = await authService.register(req.body, requestMeta(req));
    res.status(201);
    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken);
    }
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/login
router.post('/login', validateLogin, async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const result = await authService.login(email, password, requestMeta(req));
    if (result.refreshToken) {
      setRefreshTokenCookie(res, result.refreshToken);
    }
    res.json(result);
  } catch (err) {
    if (err.status === 401 || err.status === 400) {
      SecurityEvent.create({
        eventType: 'auth_failure',
        action: 'login',
        path: '/auth/login',
        method: 'POST',
        statusCode: Number(err.status || 401),
        ipAddress: requestMeta(req).ipAddress,
        macAddress: 'unavailable',
        userAgent: requestMeta(req).userAgent,
        metadata: {
          email: typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '',
        },
      }).catch(() => {});
    }
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/logout - SECURITY UPDATE IMPLEMENTED: Invalidate refresh tokens, clear cookie
router.post('/logout', async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.body?.token;
    if (token) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        if (decoded.sub) {
          await authService.invalidateRefreshTokensForUser(decoded.sub);
        }
      } catch {
        // ignore invalid token
      }
    }
    clearRefreshTokenCookie(res);
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// POST /auth/refresh - SECURITY UPDATE IMPLEMENTED: Read from cookie first, set new refresh in cookie
router.post('/refresh', async (req, res, next) => {
  try {
    const refreshToken = getRefreshTokenFromCookie(req) || req.body?.refreshToken || req.body?.refresh_token;
    const result = await authService.refresh(refreshToken, requestMeta(req));
    setRefreshTokenCookie(res, result.refreshToken);
    res.json(result);
  } catch (err) {
    clearRefreshTokenCookie(res);
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/change-password - SECURITY UPDATE IMPLEMENTED: For mustChangePassword flow; token in body or Bearer
router.post('/change-password', async (req, res, next) => {
  try {
    const { passwordChangeToken, newPassword } = req.body || {};
    const token = passwordChangeToken || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (decoded.type !== 'password_change') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    await authService.changePassword(decoded.sub, null, newPassword);
    const { accessToken, refreshToken, expiresIn } = await authService.issueTokens(
      decoded.sub,
      decoded.email,
      (await (await import('../models/User.js')).default.findById(decoded.sub).lean())?.role || 'student',
      requestMeta(req)
    );
    setRefreshTokenCookie(res, refreshToken);
    const User = (await import('../models/User.js')).default;
    const userDoc = await User.findById(decoded.sub).lean();
    SecurityEvent.create({
      eventType: 'password_update',
      action: 'change_password',
      path: '/auth/change-password',
      method: 'POST',
      statusCode: 200,
      ipAddress: requestMeta(req).ipAddress,
      userAgent: requestMeta(req).userAgent,
      userId: decoded.sub,
    }).catch(() => {});
    res.json({
      user: authService.toUserResponse(userDoc),
      token: accessToken,
      refreshToken,
      expiresIn,
    });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// GET /auth/verify - validate token, return user (Bearer required)
router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// GET /auth/me - current user (Bearer required)
router.get('/me', requireAuth, (req, res) => {
  res.json(req.user);
});

// ============================================
// 2FA (TOTP) endpoints
// ============================================

// POST /auth/2fa/setup - begin setup, return QR + secret
router.post('/2fa/setup', requireAuth, async (req, res, next) => {
  try {
    const result = await twoFAService.setup2FA(req.user.id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/2fa/enable - verify code and enable 2FA
router.post('/2fa/enable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const result = await twoFAService.enable2FA(req.user.id, code);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/2fa/disable - disable 2FA with code
router.post('/2fa/disable', requireAuth, async (req, res, next) => {
  try {
    const { code } = req.body || {};
    const result = await twoFAService.disable2FA(req.user.id, code);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/2fa/verify - complete login with 2FA token
router.post('/2fa/verify', async (req, res, next) => {
  try {
    const { twoFactorToken, code } = req.body || {};
    const result = await twoFAService.verify2FA(twoFactorToken, code);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/2fa/verify-backup - complete login with backup code
router.post('/2fa/verify-backup', async (req, res, next) => {
  try {
    const { twoFactorToken, backupCode } = req.body || {};
    const result = await twoFAService.verifyBackupCode(twoFactorToken, backupCode);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// POST /auth/2fa/regenerate-backup - generate new backup codes
router.post('/2fa/regenerate-backup', requireAuth, async (req, res, next) => {
  try {
    const result = await twoFAService.regenerateBackupCodes(req.user.id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// GET /auth/2fa/status - check 2FA status
router.get('/2fa/status', requireAuth, async (req, res, next) => {
  try {
    const result = await twoFAService.get2FAStatus(req.user.id);
    res.json(result);
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

export default router;
