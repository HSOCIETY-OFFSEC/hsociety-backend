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
    if (req.user.role === 'admin' && req.body?.role) updates.role = req.body.role;
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name || '',
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
