/**
 * Auth Routes
 * Matches frontend API_ENDPOINTS.AUTH
 * SECURITY UPDATE IMPLEMENTED: Refresh in cookie, logout invalidate, change-password, logging
 */
import { Router } from 'express';
import crypto from 'crypto';
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
const PASSWORD_RESET_EXPIRY = process.env.JWT_PASSWORD_RESET_EXPIRY || '20m';

const requestMeta = (req) => ({
  userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
  ipAddress: req.requestContext?.ipAddress || req.ip || '',
});

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

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

// POST /auth/password-reset/request - issue reset token (email delivery handled externally)
router.post('/password-reset/request', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findOne({ email }).select('+passwordResetTokenHash +passwordResetExpiresAt');
    if (user) {
      const resetToken = jwt.sign(
        { sub: user._id, email: user.email, type: 'password_reset' },
        JWT_SECRET,
        { expiresIn: PASSWORD_RESET_EXPIRY }
      );
      const resetDecoded = jwt.decode(resetToken);
      user.passwordResetTokenHash = hashToken(resetToken);
      user.passwordResetExpiresAt = resetDecoded?.exp
        ? new Date(resetDecoded.exp * 1000)
        : new Date(Date.now() + 20 * 60 * 1000);
      await user.save({ validateBeforeSave: false });
      SecurityEvent.create({
        eventType: 'password_reset',
        action: 'request',
        path: '/auth/password-reset/request',
        method: 'POST',
        statusCode: 200,
        ipAddress: requestMeta(req).ipAddress,
        userAgent: requestMeta(req).userAgent,
        userId: user._id,
      }).catch(() => {});

      if (process.env.NODE_ENV !== 'production') {
        return res.json({
          success: true,
          message: 'Password reset instructions sent to your email',
          resetToken,
        });
      }
    }

    return res.json({
      success: true,
      message: 'Password reset instructions sent to your email',
    });
  } catch (err) {
    next(err);
  }
});

// POST /auth/password-reset/confirm - reset password with token
router.post('/password-reset/confirm', async (req, res, next) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (decoded.type !== 'password_reset') {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const User = (await import('../models/User.js')).default;
    const user = await User.findById(decoded.sub).select('+passwordResetTokenHash +passwordResetExpiresAt');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    if (!user.passwordResetTokenHash || hashToken(token) !== user.passwordResetTokenHash) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    if (user.passwordResetExpiresAt && user.passwordResetExpiresAt.getTime() < Date.now()) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    await authService.changePassword(user._id, null, newPassword);
    user.passwordResetTokenHash = '';
    user.passwordResetExpiresAt = null;
    await user.save({ validateBeforeSave: false });

    SecurityEvent.create({
      eventType: 'password_update',
      action: 'password_reset',
      path: '/auth/password-reset/confirm',
      method: 'POST',
      statusCode: 200,
      ipAddress: requestMeta(req).ipAddress,
      userAgent: requestMeta(req).userAgent,
      userId: user._id,
    }).catch(() => {});

    return res.json({ success: true, message: 'Password reset successful' });
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
