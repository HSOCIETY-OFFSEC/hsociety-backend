/**
 * Public Routes
 * No auth required
 */
import { Router } from 'express';
import { Audit, CommunityConfig, CommunityMessage, Pentest, SecurityEvent, SiteContent, Subscription, User } from '../models/index.js';
import { optionalAuth } from '../middleware/auth.middleware.js';

const router = Router();

const sumSeverity = (severity = {}) =>
  Number(severity.critical || 0) +
  Number(severity.high || 0) +
  Number(severity.medium || 0) +
  Number(severity.low || 0) +
  Number(severity.info || 0);

const averageRemediationRate = (audits = []) => {
  if (!audits.length) return 0;
  const total = audits.reduce((acc, audit) => acc + Number(audit.remediationProgress || 0), 0);
  return Math.round(total / audits.length);
};

// GET /public/landing-stats
router.get('/landing-stats', async (_req, res, next) => {
  try {
    const [
      learnersTrained,
      communityMembers,
      engagementsCompleted,
      paidPentestsDelivered,
      audits,
      communityConfig,
    ] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      User.countDocuments({}),
      Audit.countDocuments({ status: 'completed' }),
      Pentest.countDocuments({ status: 'completed' }),
      Audit.find().select('severity remediationProgress').lean(),
      CommunityConfig.findOne().select('stats').lean(),
    ]);

    const vulnerabilitiesIdentified = audits.reduce(
      (acc, audit) => acc + sumSeverity(audit.severity),
      0
    );

    // Prefer live data; fall back to configured community stats if empty.
    const fallbackLearners = Number(communityConfig?.stats?.learners || 0);
    const resolvedLearners = learnersTrained || fallbackLearners;
    const resolvedCommunity = communityMembers || fallbackLearners;

    const remediationSuccess = averageRemediationRate(audits);

    res.json({
      stats: {
        learnersTrained: resolvedLearners,
        communityMembers: resolvedCommunity,
        engagementsCompleted,
        vulnerabilitiesIdentified,
        paidPentestsDelivered,
      },
      heroProof: {
        validatedFindings: vulnerabilitiesIdentified,
        remediationSuccess,
        countriesSupported: 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

const getSiteContent = async () => {
  const doc = await SiteContent.findOne({ key: 'site' }).lean();
  if (!doc) {
    const created = await SiteContent.create({ key: 'site' });
    return created.toObject();
  }
  return doc;
};

// GET /public/content/landing
router.get('/content/landing', async (_req, res, next) => {
  try {
    const content = await getSiteContent();
    res.json({ landing: content.landing || {} });
  } catch (err) {
    next(err);
  }
});

// GET /public/content/terms
router.get('/content/terms', async (_req, res, next) => {
  try {
    const content = await getSiteContent();
    res.json({ terms: content.terms || {} });
  } catch (err) {
    next(err);
  }
});

// GET /public/blog-posts
router.get('/blog-posts', async (_req, res, next) => {
  try {
    const content = await getSiteContent();
    res.json({ posts: content.blog?.posts || [] });
  } catch (err) {
    next(err);
  }
});

const normalizeEmail = (value) => (typeof value === 'string' ? value.trim().toLowerCase() : '');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

router.post('/subscribe', async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body?.email);
    if (!email) return res.status(400).json({ error: 'Email is required' });
    if (!EMAIL_REGEX.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const payload = {
      email,
      name: typeof req.body?.name === 'string' ? req.body.name.trim() : '',
      source: req.body?.source || 'landing',
      metadata: {
        ip: req.ip,
        userAgent: req.headers['user-agent'] || '',
      },
    };

    const doc = await Subscription.findOneAndUpdate(
      { email },
      { $set: payload },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    res.json({
      success: true,
      message: doc.createdAt?.getTime() === doc.updatedAt?.getTime()
        ? 'Subscription created'
        : 'Subscription already active',
    });
  } catch (err) {
    next(err);
  }
});

// POST /public/security-events
router.post('/security-events', optionalAuth, async (req, res, next) => {
  try {
    const eventType = String(req.body?.eventType || 'frontend_activity').trim().slice(0, 64);
    const action = String(req.body?.action || 'interaction').trim().slice(0, 128);
    const path = String(req.body?.path || '').trim().slice(0, 256);
    const deviceId = String(req.body?.deviceId || '').trim().slice(0, 128);
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

    if (!action) return res.status(400).json({ error: 'Action is required' });

    await SecurityEvent.create({
      eventType,
      action,
      path,
      method: 'CLIENT',
      statusCode: 200,
      ipAddress: req.ip || '',
      macAddress: 'unavailable',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
      deviceId,
      metadata,
      userId: req.user?.id || null,
    });

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

// GET /public/community-profiles
router.get('/community-profiles', async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit || 6);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 12) : 6;

    const messageAgg = await CommunityMessage.aggregate([
      {
        $group: {
          _id: '$userId',
          messages: { $sum: 1 },
          likesReceived: { $sum: '$likes' },
          imagesShared: {
            $sum: { $cond: [{ $ne: ['$imageUrl', ''] }, 1, 0] }
          }
        }
      },
      { $sort: { likesReceived: -1, messages: -1 } },
      { $limit: limit }
    ]);

    const commentAgg = await CommunityMessage.aggregate([
      { $unwind: '$comments' },
      {
        $group: {
          _id: '$comments.userId',
          commentsMade: { $sum: 1 }
        }
      }
    ]);

    const commentsMap = new Map(
      commentAgg.map((row) => [String(row._id || ''), Number(row.commentsMade || 0)])
    );

    const userIds = messageAgg.map((row) => row._id).filter(Boolean);
    let users = [];
    if (userIds.length) {
      users = await User.find({ _id: { $in: userIds }, role: { $ne: 'admin' } })
        .select('_id name role organization avatarUrl hackerHandle bio createdAt')
        .lean();
    }

    if (!users.length) {
      users = await User.find({ role: { $ne: 'admin' } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('_id name role organization avatarUrl hackerHandle bio createdAt')
        .lean();
    }

    const statsMap = new Map(
      messageAgg.map((row) => [
        String(row._id || ''),
        {
          messages: Number(row.messages || 0),
          likesReceived: Number(row.likesReceived || 0),
          imagesShared: Number(row.imagesShared || 0),
        }
      ])
    );

    const payload = users.map((user) => {
      const stats = statsMap.get(String(user._id)) || {
        messages: 0,
        likesReceived: 0,
        imagesShared: 0,
      };
      return {
        id: user._id.toString(),
        name: user.name || 'Community Member',
        role: user.role || 'member',
        organization: user.organization || '',
        avatarUrl: user.avatarUrl || '',
        hackerHandle: user.hackerHandle || '',
        bio: user.bio || '',
        stats: {
          messages: stats.messages,
          likesReceived: stats.likesReceived,
          commentsMade: commentsMap.get(String(user._id)) || 0,
          imagesShared: stats.imagesShared,
        }
      };
    });

    res.json({ profiles: payload });
  } catch (err) {
    next(err);
  }
});

export default router;
