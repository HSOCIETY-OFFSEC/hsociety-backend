import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import { listAgreements, listInvoices } from '../services/corporate.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles('corporate', 'admin'));

router.get('/invoices', async (req, res, next) => {
  try {
    const items = await listInvoices(req.user);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/agreements', async (req, res, next) => {
  try {
    const items = await listAgreements(req.user);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.get('/invoices/:id/download', async (req, res, next) => {
  try {
    const items = await listInvoices(req.user);
    const invoice = items.find((item) => item.id === req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });

    const payload = [
      'HSOCIETY Invoice Placeholder',
      `Invoice: ${invoice.id}`,
      `Engagement: ${invoice.engagementName}`,
      `Amount: ${invoice.amount} ${invoice.currency || 'USD'}`,
      `Status: ${invoice.status}`,
    ].join('\n');

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${invoice.id}.txt"`);
    res.send(payload);
  } catch (err) {
    next(err);
  }
});

export default router;
