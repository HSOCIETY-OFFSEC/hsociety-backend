import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { getRemediationReports, getRemediationSummary } from '../services/corporate.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles('corporate', 'admin'));

router.get('/summary', async (req, res, next) => {
  try {
    const data = await getRemediationSummary(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

router.get('/reports', async (req, res, next) => {
  try {
    const data = await getRemediationReports(req.user);
    res.json(data);
  } catch (err) {
    next(err);
  }
});

export default router;
