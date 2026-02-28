/**
 * Admin Routes
 */
import { Router } from 'express';
import { Audit, CommunityConfig, CommunityMessage, CommunityPost, Feedback, Pentest, SiteContent, User } from '../models/index.js';
import { requireAdmin, requireAuth } from '../middleware/auth.middleware.js';
import {
  approvePaidPentest,
  assignEngagement,
  getAnalytics,
  publishCaseStudy,
} from '../services/admin.service.js';

const router = Router();

router.use(requireAuth);
router.use(requireAdmin);

const toUserResponse = (user) => ({
  id: user._id.toString(),
  name: user.name || '',
  email: user.email,
  role: user.role,
  organization: user.organization || '',
  bootcampStatus: user.bootcampStatus || 'not_enrolled',
  mutedUntil: user.mutedUntil || null,
  createdAt: user.createdAt,
});

// GET /admin/users
router.get('/users', async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 }).lean();
    res.json(users.map(toUserResponse));
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/users/:id
router.patch('/users/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.email === 'string') updates.email = req.body.email.trim().toLowerCase();
    if (typeof req.body?.organization === 'string') {
      updates.organization = req.body.organization.trim();
    }
    if (req.body?.role && ['student', 'pentester', 'corporate', 'admin'].includes(req.body.role)) {
      updates.role = req.body.role;
    }
    if (
      req.body?.bootcampStatus &&
      ['not_enrolled', 'enrolled', 'completed'].includes(req.body.bootcampStatus)
    ) {
      updates.bootcampStatus = req.body.bootcampStatus;
    }

    const user = await User.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(toUserResponse(user));
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/users/:id/mute
router.patch('/users/:id/mute', async (req, res, next) => {
  try {
    const minutes = Number(req.body?.minutes || 0);
    const mutedUntil =
      minutes > 0 ? new Date(Date.now() + minutes * 60 * 1000) : null;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { mutedUntil } },
      { new: true }
    ).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({
      id: user._id.toString(),
      mutedUntil: user.mutedUntil || null
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/pentests
router.get('/pentests', async (_req, res, next) => {
  try {
    const pentests = await Pentest.find().sort({ createdAt: -1 }).lean();
    res.json(pentests);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/pentests/:id
router.patch('/pentests/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    if (req.body?.assignedTo) updates.assignedTo = req.body.assignedTo;
    if (req.body?.metadata) updates.metadata = req.body.metadata;
    if (req.body?.reportAvailable !== undefined) {
      updates['metadata.reportAvailable'] = Boolean(req.body.reportAvailable);
    }
    const doc = await Pentest.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Pentest not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/pentests/:id/assign
router.patch('/pentests/:id/assign', async (req, res, next) => {
  try {
    const doc = await assignEngagement(req.params.id, req.body?.assignedTo || null);
    if (!doc) return res.status(404).json({ error: 'Pentest not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// POST /admin/pentests/:id/approve-payment
router.post('/pentests/:id/approve-payment', async (req, res, next) => {
  try {
    const doc = await approvePaidPentest(req.params.id);
    if (!doc) return res.status(404).json({ error: 'Pentest not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/audits/:id
router.patch('/audits/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    if (req.body?.reportAvailable !== undefined) {
      updates.reportAvailable = Boolean(req.body.reportAvailable);
    }
    if (req.body?.reportContent !== undefined) {
      updates.reportContent = String(req.body.reportContent || '');
    }
    const doc = await Audit.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Audit not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/feedback/:id
router.patch('/feedback/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.status) updates.status = req.body.status;
    const doc = await Feedback.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Feedback not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// POST /admin/case-studies
router.post('/case-studies', async (req, res, next) => {
  try {
    if (!req.body?.title) return res.status(400).json({ error: 'Title is required' });
    const doc = await publishCaseStudy(req.user.id, req.body || {});
    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
});

// GET /admin/analytics
router.get('/analytics', async (_req, res, next) => {
  try {
    const data = await getAnalytics();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /admin/community/messages
router.get('/community/messages', async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 100;
    const messages = await CommunityMessage.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/community/messages/:id
router.patch('/community/messages/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.pinned !== undefined) updates.pinned = Boolean(req.body.pinned);
    const doc = await CommunityMessage.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Message not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/community/messages/:id
router.delete('/community/messages/:id', async (req, res, next) => {
  try {
    const doc = await CommunityMessage.findByIdAndDelete(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Message not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /admin/community/posts
router.get('/community/posts', async (_req, res, next) => {
  try {
    const posts = await CommunityPost.find().sort({ createdAt: -1 }).lean();
    res.json(posts);
  } catch (err) {
    next(err);
  }
});

// GET /admin/content
router.get('/content', async (_req, res, next) => {
  try {
    let content = await SiteContent.findOne({ key: 'site' }).lean();
    if (!content) {
      content = await SiteContent.create({ key: 'site' });
      return res.json(content.toObject());
    }
    res.json(content);
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/content
router.patch('/content', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.landing && typeof req.body.landing === 'object') {
      updates['landing.heroTitle'] = String(req.body.landing.heroTitle || '').trim();
      updates['landing.heroDescription'] = String(req.body.landing.heroDescription || '').trim();
      updates['landing.ctaPrimary'] = String(req.body.landing.ctaPrimary || '').trim();
      updates['landing.ctaSecondary'] = String(req.body.landing.ctaSecondary || '').trim();
      updates['landing.communitySubtitle'] = String(req.body.landing.communitySubtitle || '').trim();
    }
    if (req.body?.blog && Array.isArray(req.body.blog.posts)) {
      updates['blog.posts'] = req.body.blog.posts.map((post) => ({
        title: String(post.title || '').trim(),
        date: String(post.date || '').trim(),
        summary: String(post.summary || '').trim(),
      })).filter((post) => post.title && post.summary);
    }

    const content = await SiteContent.findOneAndUpdate(
      { key: 'site' },
      { $set: updates },
      { new: true, upsert: true }
    ).lean();
    res.json(content || {});
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/community/posts/:id
router.patch('/community/posts/:id', async (req, res, next) => {
  try {
    const updates = {};
    if (req.body?.pinned !== undefined) updates.pinned = Boolean(req.body.pinned);
    if (req.body?.visibility) updates.visibility = req.body.visibility;
    const doc = await CommunityPost.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true }
    ).lean();
    if (!doc) return res.status(404).json({ error: 'Post not found' });
    res.json(doc);
  } catch (err) {
    next(err);
  }
});

// DELETE /admin/community/posts/:id
router.delete('/community/posts/:id', async (req, res, next) => {
  try {
    const doc = await CommunityPost.findByIdAndDelete(req.params.id).lean();
    if (!doc) return res.status(404).json({ error: 'Post not found' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// GET /admin/overview
router.get('/overview', async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24);

    const [
      totalUsers,
      activeUsers,
      usersByRole,
      messageCount,
      postCount,
      commentAgg,
      pentestAgg,
      communityConfig
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ lastLoginAt: { $gte: since } }),
      User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
      CommunityMessage.countDocuments(),
      CommunityPost.countDocuments(),
      CommunityMessage.aggregate([
        { $unwind: '$comments' },
        { $group: { _id: null, total: { $sum: 1 } } }
      ]),
      Pentest.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      CommunityConfig.findOne().select('stats').lean(),
    ]);

    const roleMap = usersByRole.reduce((acc, row) => {
      acc[row._id || 'unknown'] = row.count;
      return acc;
    }, {});

    const pentestMap = pentestAgg.reduce((acc, row) => {
      acc[row._id || 'unknown'] = row.count;
      return acc;
    }, {});

    res.json({
      users: {
        total: totalUsers || 0,
        active24h: activeUsers || 0,
        byRole: roleMap,
      },
      community: {
        messages: messageCount || 0,
        posts: postCount || 0,
        comments: commentAgg?.[0]?.total || 0,
        stats: communityConfig?.stats || {},
      },
      pentests: {
        total: Object.values(pentestMap).reduce((acc, val) => acc + Number(val || 0), 0),
        byStatus: pentestMap,
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /admin/community/config
router.get('/community/config', async (_req, res, next) => {
  try {
    const config = await CommunityConfig.findOne().lean();
    res.json(config || {});
  } catch (err) {
    next(err);
  }
});

// PATCH /admin/community/config
router.patch('/community/config', async (req, res, next) => {
  try {
    const updates = {};
    if (Array.isArray(req.body?.channels)) {
      updates.channels = req.body.channels
        .map((ch) => ({
          id: String(ch?.id || '').trim(),
          name: String(ch?.name || '').trim(),
        }))
        .filter((ch) => ch.id && ch.name);
    }
    if (Array.isArray(req.body?.tags)) {
      updates.tags = req.body.tags.map((tag) => String(tag || '').trim()).filter(Boolean);
    }
    if (req.body?.stats && typeof req.body.stats === 'object') {
      updates.stats = {
        learners: Number(req.body.stats.learners || 0),
        questions: Number(req.body.stats.questions || 0),
        answered: Number(req.body.stats.answered || 0),
      };
    }
    if (req.body?.mentor && typeof req.body.mentor === 'object') {
      updates.mentor = {
        id: String(req.body.mentor.id || '').trim() || 'mentor',
        name: String(req.body.mentor.name || '').trim(),
        role: String(req.body.mentor.role || '').trim(),
        avatar: String(req.body.mentor.avatar || '').trim(),
      };
    }
    if (req.body?.challengeStudent && typeof req.body.challengeStudent === 'object') {
      updates.challengeStudent = {
        id: String(req.body.challengeStudent.id || '').trim() || 'weekly',
        title: String(req.body.challengeStudent.title || '').trim(),
        description: String(req.body.challengeStudent.description || '').trim(),
      };
    }
    if (req.body?.challengeCorporate && typeof req.body.challengeCorporate === 'object') {
      updates.challengeCorporate = {
        id: String(req.body.challengeCorporate.id || '').trim() || 'weekly',
        title: String(req.body.challengeCorporate.title || '').trim(),
        description: String(req.body.challengeCorporate.description || '').trim(),
      };
    }

    const doc = await CommunityConfig.findOneAndUpdate({}, { $set: updates }, { new: true, upsert: true }).lean();
    res.json(doc || {});
  } catch (err) {
    next(err);
  }
});

export default router;
