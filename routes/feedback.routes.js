/**
 * Feedback Routes
 * Matches frontend API_ENDPOINTS.FEEDBACK
 */
import { Router } from 'express';
import { Feedback, DashboardActivity } from '../models/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

const toFeedbackResponse = (item) => ({
  id: item._id.toString(),
  type: item.type || item.category || 'general',
  subject: item.subject || '',
  message: item.message || '',
  status: item.status || 'received',
  priority: item.priority || 'normal',
  date: item.createdAt?.getTime?.() || Date.now(),
  ticketNumber: item.ticketNumber || '',
  contact: item.contact || {
    name: '',
    email: '',
    allowContact: false,
  },
});

// POST /feedback - public (optional auth)
router.post('/', optionalAuth, async (req, res, next) => {
  try {
    const ticketNumber = 'FB-' + Date.now();
    const payload = req.body || {};
    const doc = await Feedback.create({
      ticketNumber,
      email: payload?.contact?.email || payload?.email,
      subject: payload?.subject ?? '',
      message: payload?.message ?? payload?.body ?? '',
      type: payload?.type || payload?.category || 'general',
      priority: payload?.priority || 'normal',
      category: payload?.category || payload?.type || 'general',
      contact: {
        name: payload?.contact?.name || '',
        email: payload?.contact?.email || '',
        allowContact: Boolean(payload?.contact?.allowContact),
      },
      userId: req.user?.id,
    });

    await DashboardActivity.create({
      type: 'feedback',
      title: payload?.subject || 'Feedback submitted',
      status: 'received',
      icon: 'alert',
      userId: req.user?.id,
      metadata: { feedbackId: doc._id.toString() },
    });

    res.status(201).json(toFeedbackResponse(doc));
  } catch (err) {
    next(err);
  }
});

// GET /feedback - requires auth
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const { status, limit = 50 } = req.query || {};
    const query = {};
    if (status) query.status = status;
    if (req.user?.role !== 'admin') query.userId = req.user.id;

    const items = await Feedback.find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(100, Number(limit) || 50))
      .lean();

    res.json(items.map(toFeedbackResponse));
  } catch (err) {
    next(err);
  }
});

// GET /feedback/:id - requires auth
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const doc = await Feedback.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (req.user?.role !== 'admin' && doc.userId?.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(toFeedbackResponse(doc));
  } catch (err) {
    next(err);
  }
});

export default router;
