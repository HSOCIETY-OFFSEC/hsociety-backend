/**
 * Dashboard Routes
 * Matches frontend API_ENDPOINTS.DASHBOARD
 */
import { Router } from 'express';
import { Audit, DashboardActivity, Pentest } from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

const sumSeverity = (severity = {}) =>
  Number(severity.critical || 0) +
  Number(severity.high || 0) +
  Number(severity.medium || 0) +
  Number(severity.low || 0) +
  Number(severity.info || 0);

const toActivityResponse = (activity) => ({
  id: activity._id.toString(),
  type: activity.type || 'activity',
  title: activity.title || 'Activity',
  status: activity.status || 'pending',
  date: activity.date?.getTime?.() || activity.createdAt?.getTime?.() || Date.now(),
  icon: activity.icon || 'shield',
});

router.use(requireAuth);

// GET /dashboard/stats
router.get('/stats', async (_req, res, next) => {
  try {
    const activePentests = await Pentest.countDocuments({
      status: { $in: ['pending', 'in-progress'] },
    });
    const completedAudits = await Audit.countDocuments({ status: 'completed' });
    const pendingReports = await Audit.countDocuments({ reportAvailable: false });

    const audits = await Audit.find().select('severity remediationProgress').lean();
    const vulnerabilitiesFound = audits.reduce((acc, audit) => acc + sumSeverity(audit.severity), 0);
    const remediationRate = audits.length
      ? Math.round(
          audits.reduce((acc, audit) => acc + Number(audit.remediationProgress || 0), 0) /
            audits.length
        )
      : 0;

    res.json({
      activePentests,
      completedAudits,
      pendingReports,
      vulnerabilitiesFound,
      remediationRate,
    });
  } catch (err) {
    next(err);
  }
});

// GET /dashboard/activity
router.get('/activity', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
    const query = req.user.role === 'admin' ? {} : { userId: req.user.id };
    const items = await DashboardActivity.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ items: items.map(toActivityResponse), total: items.length });
  } catch (err) {
    next(err);
  }
});

// GET /dashboard/overview
router.get('/overview', async (req, res, next) => {
  try {
    const activityQuery = req.user.role === 'admin' ? {} : { userId: req.user.id };
    const [activePentests, completedAudits, pendingReports, audits, activityItems, latestAudit] =
      await Promise.all([
        Pentest.countDocuments({ status: { $in: ['pending', 'in-progress'] } }),
        Audit.countDocuments({ status: 'completed' }),
        Audit.countDocuments({ reportAvailable: false }),
        Audit.find().select('severity remediationProgress').lean(),
        DashboardActivity.find(activityQuery)
          .sort({ createdAt: -1 })
          .limit(10)
          .lean(),
        Audit.findOne().sort({ date: -1 }).lean(),
      ]);

    const vulnerabilitiesFound = audits.reduce((acc, audit) => acc + sumSeverity(audit.severity), 0);
    const remediationRate = audits.length
      ? Math.round(
          audits.reduce((acc, audit) => acc + Number(audit.remediationProgress || 0), 0) /
            audits.length
        )
      : 0;

    const statsRes = {
      activePentests,
      completedAudits,
      pendingReports,
      vulnerabilitiesFound,
      remediationRate,
    };

    const quickStats = {
      avgResponseTime: '24 hours',
      securityScore: Number(statsRes.remediationRate || 0),
      lastScan: latestAudit?.date ? new Date(latestAudit.date).getTime() : null,
    };

    res.json({
      stats: statsRes,
      recentActivity: activityItems.map(toActivityResponse),
      quickStats,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
