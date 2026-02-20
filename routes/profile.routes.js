/**
 * Profile Routes
 * Matches frontend API_ENDPOINTS.PROFILE
 */
import { Router } from 'express';
import { User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

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
      role: user.role,
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
    if (req.user.role === 'admin' && req.body?.role) updates.role = req.body.role;
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
      organization: user.organization || '',
      avatarUrl: user.avatarUrl || '',
      role: user.role,
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
      role: user.role,
    });
  } catch (err) {
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
