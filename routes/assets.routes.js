import { Router } from 'express';
import { requireAuth, requireRoles } from '../middleware/auth.middleware.js';
import {
  createAsset,
  deleteAsset,
  listAssets,
  updateAsset,
} from '../services/corporate.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireRoles('corporate', 'admin'));

router.get('/', async (req, res, next) => {
  try {
    const items = await listAssets(req.user);
    res.json(items);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    if (!req.body?.name) return res.status(400).json({ error: 'Asset name is required' });
    const created = await createAsset(req.user, req.body || {});
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const updated = await updateAsset(req.user, req.params.id, req.body || {});
    if (!updated) return res.status(404).json({ error: 'Asset not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const removed = await deleteAsset(req.user, req.params.id);
    if (!removed) return res.status(404).json({ error: 'Asset not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
