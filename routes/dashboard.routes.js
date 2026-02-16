/**
 * Dashboard Routes
 * Matches frontend API_ENDPOINTS.DASHBOARD
 */
import { Router } from 'express';

const router = Router();

const mockStats = {
  activePentests: 3,
  completedAudits: 12,
  pendingReports: 2,
  vulnerabilitiesFound: 47,
  remediationRate: 68
};

const mockRecentActivity = [
  {
    id: '1',
    type: 'pentest',
    title: 'Web Application Pentest',
    status: 'in-progress',
    date: Date.now() - (2 * 24 * 60 * 60 * 1000),
    icon: 'shield'
  },
  {
    id: '2',
    type: 'audit',
    title: 'Security Audit Report',
    status: 'completed',
    date: Date.now() - (5 * 24 * 60 * 60 * 1000),
    icon: 'file'
  },
  {
    id: '3',
    type: 'report',
    title: 'Vulnerability Assessment',
    status: 'pending',
    date: Date.now() - (7 * 24 * 60 * 60 * 1000),
    icon: 'alert'
  }
];

const mockQuickStats = {
  avgResponseTime: '24 hours',
  securityScore: 85,
  lastScan: Date.now() - (3 * 24 * 60 * 60 * 1000)
};

// GET /dashboard/stats - TODO: Add auth middleware, connect to data source
router.get('/stats', (req, res) => {
  res.json(mockStats);
});

// GET /dashboard/activity - TODO: Implement data source
router.get('/activity', (req, res) => {
  const limit = Math.max(1, Math.min(50, Number(req.query.limit || 10)));
  res.json({
    items: mockRecentActivity.slice(0, limit),
    total: mockRecentActivity.length
  });
});

// GET /dashboard/overview - Returns mock data for frontend dev
router.get('/overview', (req, res) => {
  res.json({
    stats: mockStats,
    recentActivity: mockRecentActivity,
    quickStats: mockQuickStats
  });
});

export default router;
