/**
 * Audits Routes
 * Matches frontend API_ENDPOINTS.AUDITS
 */
import { Router } from 'express';
import { Audit, DashboardActivity } from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

const toAuditResponse = (audit) => ({
  id: audit._id.toString(),
  title: audit.title,
  type: audit.type,
  date: audit.date?.getTime?.() || audit.date,
  status: audit.status,
  severity: audit.severity || { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  remediationProgress: audit.remediationProgress || 0,
  tester: audit.tester || 'Security Team',
  reportAvailable: Boolean(audit.reportAvailable),
});

const ensureAuditDefaults = (data = {}) => ({
  title: data.title || 'Untitled audit',
  type: data.type || 'General',
  date: data.date ? new Date(data.date) : new Date(),
  status: data.status || 'draft',
  severity: data.severity || { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
  remediationProgress: Number(data.remediationProgress || 0),
  tester: data.tester || 'Security Team',
  reportAvailable: Boolean(data.reportAvailable),
  reportContent: data.reportContent || '',
  metadata: data.metadata || {},
});

// All audit routes require auth
router.use(requireAuth);

// GET /audits
router.get('/', async (_req, res, next) => {
  try {
    const audits = await Audit.find().sort({ createdAt: -1 }).lean();
    res.json(audits.map(toAuditResponse));
  } catch (err) {
    next(err);
  }
});

// POST /audits
router.post('/', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const payload = ensureAuditDefaults(req.body || {});
    const doc = await Audit.create({
      ...payload,
      requestedBy: req.user.id,
    });

    await DashboardActivity.create({
      type: 'audit',
      title: payload.title,
      status: payload.status,
      icon: 'file',
      userId: req.user.id,
      metadata: { auditId: doc._id.toString() },
    });

    res.status(201).json(toAuditResponse(doc));
  } catch (err) {
    next(err);
  }
});

// GET /audits/:id
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Audit.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(toAuditResponse(doc));
  } catch (err) {
    next(err);
  }
});

// PUT /audits/:id
router.put('/:id', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const payload = ensureAuditDefaults(req.body || {});
    const doc = await Audit.findByIdAndUpdate(
      req.params.id,
      { $set: payload },
      { new: true, runValidators: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json(toAuditResponse(doc));
  } catch (err) {
    next(err);
  }
});

// DELETE /audits/:id
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const result = await Audit.findByIdAndDelete(req.params.id);
    if (!result) return res.status(404).json({ error: 'Not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /audits/:id/download
router.get('/:id/download', async (req, res, next) => {
  try {
    const doc = await Audit.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    if (!doc.reportAvailable) return res.status(404).json({ error: 'Report not available' });

    const content = doc.reportContent || `Audit Report\n\n${doc.title}\nStatus: ${doc.status}`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="audit-report-${doc._id}.pdf"`);
    res.send(Buffer.from(content, 'utf-8'));
  } catch (err) {
    next(err);
  }
});

// GET /audits/:id/history
router.get('/:id/history', async (req, res, next) => {
  try {
    const doc = await Audit.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Not found' });
    res.json({
      items: [
        {
          id: `history-${doc._id}`,
          status: doc.status,
          date: doc.updatedAt || doc.createdAt,
        },
      ],
    });
  } catch (err) {
    next(err);
  }
});

export default router;
