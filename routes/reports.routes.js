import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { listReports } from '../services/corporate.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles('corporate', 'pentester', 'admin'));

router.get('/', async (req, res, next) => {
  try {
    const reports = await listReports(req.user);
    res.json(reports);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/download', async (req, res, next) => {
  try {
    const reports = await listReports(req.user);
    const report = reports.find((item) => item.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Report not found' });

    const payload = [
      'HSOCIETY Pentest Report Placeholder',
      `Report: ${report.title}`,
      `Engagement: ${report.engagementName}`,
      `Status: ${report.status}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${report.id}.txt"`);
    res.send(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
