import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware.js';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../services/corporate.service.js';

const router = Router();

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const items = await listNotifications(req.user);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const items = await listNotifications(req.user);
    const item = items.find((n) => n.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const item = await markNotificationRead(req.user, req.params.id);
    if (!item) return res.status(404).json({ error: 'Notification not found' });
    res.json(item);
  } catch (err) {
    next(err);
  }
});

router.post('/read-all', async (req, res, next) => {
  try {
    const result = await markAllNotificationsRead(req.user);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // Placeholder endpoint for future hard-delete support.
    res.status(501).json({ error: 'Delete notifications is not implemented yet' });
  } catch (err) {
    next(err);
  }
});

export default router;
