import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { listEngagements, requestEngagement } from '../services/corporate.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles('corporate', 'admin'));

router.get('/', async (req, res, next) => {
  try {
    const data = await listEngagements(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/request', async (req, res, next) => {
  try {
    const result = await requestEngagement(req.user, req.body || {});
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
