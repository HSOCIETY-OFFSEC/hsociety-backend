/**
 * Admin Routes
 */
import { Router } from 'express';
import { Audit, Feedback, Pentest, User } from '../models/index.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

const toUserResponse = (user) => ({
  id: user._id.toString(),
  name: user.name || '',
  email: user.email,
  role: user.role,
  organization: user.organization || '',
  bootcampStatus: user.bootcampStatus || 'not_enrolled',
  createdAt: user.createdAt,
});

// GET /admin/users
router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users.map(toUserResponse));
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/users/:id
router.patch('/users/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.email === 'string') updates.email = req.body.email.trim().toLowerCase();
    if (typeof req.body?.organization === 'string') {
      updates.organization = req.body.organization.trim();
    }
    if (req.body?.role && ['student', 'pentester', 'admin'].includes(req.body.role)) {
      updates.role = req.body.role;
    }
    if (
      req.body?.bootcampStatus &&
      ['not_enrolled', 'enrolled', 'completed'].includes(req.body.bootcampStatus)
    ) {
      updates.bootcampStatus = req.body.bootcampStatus;
    }

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(toUserResponse(user));
  } catch (err) {
    next(err);
  }
});

// GET /admin/pentests
router.get('/pentests', async (_req, res, next) => {
  try {
    const pentests = await Pentest.find().sort({ createdAt: -1 }).lean();
    res.json(pentests);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/pentests/:id
router.patch('/pentests/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    if (req.body?.assignedTo) updates.assignedTo = req.body.assignedTo;
    if (req.body?.metadata) updates.metadata = req.body.metadata;
    if (req.body?.reportAvailable !== undefined) {
      updates['metadata.reportAvailable'] = Boolean(req.body.reportAvailable);
    }
    const doc = await Pentest.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Pentest not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/audits/:id
router.patch('/audits/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    if (req.body?.reportAvailable !== undefined) {
      updates.reportAvailable = Boolean(req.body.reportAvailable);
    }
    if (req.body?.reportContent !== undefined) {
      updates.reportContent = String(req.body.reportContent || '');
    }
    const doc = await Audit.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Audit not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/feedback/:id
router.patch('/feedback/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    const doc = await Feedback.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Feedback not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

export default router;
