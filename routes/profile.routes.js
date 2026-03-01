/**
 * Profile Routes
 * Matches frontend API_ENDPOINTS.PROFILE
 * SECURITY UPDATE IMPLEMENTED: Change password with strong validation, logging
 */
import { Router } from 'express';
import { User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import { SecurityEvent } from '../models/index.js';
import { validatePasswordStrength } from '../utils/security.js';

const router = Router();

router.use(requireAuth);

// GET /profile
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      organization: user.organization || '',
      avatarUrl: user.avatarUrl || '',
      bootcampStatus: user.bootcampStatus || 'not_enrolled',
      bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
      role: user.role,
      hackerHandle: user.hackerHandle || '',
      bio: user.bio || '',
    });
  } catch (err) {
    next(err);
  }
});

// PUT /profile
router.put('/', async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.organization === 'string') {
      updates.organization = req.body.organization.trim();
    }
    if (typeof req.body?.hackerHandle === 'string') {
      updates.hackerHandle = req.body.hackerHandle.trim();
    }
    if (typeof req.body?.bio === 'string') {
      updates.bio = req.body.bio.trim();
    }
    if (req.user.role === 'admin' && req.body?.role) updates.role = req.body.role;
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      organization: user.organization || '',
      avatarUrl: user.avatarUrl || '',
      bootcampStatus: user.bootcampStatus || 'not_enrolled',
      bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
      role: user.role,
      hackerHandle: user.hackerHandle || '',
      bio: user.bio || '',
    });
  } catch (err) {
    next(err);
  }
});

// PUT /profile/avatar
router.put('/avatar', async (req, res, next) => {
  try {
    const avatarUrl = typeof req.body?.avatarUrl === 'string'
      ? req.body.avatarUrl.trim()
      : typeof req.body?.avatar === 'string'
        ? req.body.avatar.trim()
        : '';

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { avatarUrl } },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      organization: user.organization || '',
      avatarUrl: user.avatarUrl || '',
      bootcampStatus: user.bootcampStatus || 'not_enrolled',
      bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
      role: user.role,
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /profile/avatar
router.delete('/avatar', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { avatarUrl: '' } },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      organization: user.organization || '',
      avatarUrl: '',
      bootcampStatus: user.bootcampStatus || 'not_enrolled',
      bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
      role: user.role,
      hackerHandle: user.hackerHandle || '',
      bio: user.bio || '',
    });
  } catch (err) {
    next(err);
  }
});

// PUT /profile/password - SECURITY UPDATE IMPLEMENTED: Strong password, log change
router.put('/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({ error: pwdCheck.message });
    }
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    SecurityEvent.create({
      eventType: 'password_update',
      action: 'change_password_profile',
      path: '/profile/password',
      method: 'PUT',
      statusCode: 200,
      ipAddress: req.requestContext?.ipAddress || req.ip || '',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
      userId: req.user.id,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// DELETE /profile
router.delete('/', async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
