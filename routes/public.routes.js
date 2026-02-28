/**
 * Public Routes
 * No auth required
 */
import { Router } from 'express';
import { Audit, CommunityConfig, CommunityMessage, Pentest, Subscription, User } from '../models/index.js';

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
      users = await User.find({ _id: { $in: userIds } })
        .select('_id name role organization avatarUrl hackerHandle bio createdAt')
        .lean();
    }

    if (!users.length) {
      users = await User.find()
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
