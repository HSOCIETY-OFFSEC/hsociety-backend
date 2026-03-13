/**
 * Public Routes
 * No auth required
 */
import mongoose from 'mongoose';
import { Router } from 'express';
import {
  Audit,
  CommunityConfig,
  CommunityMessage,
  CommunityPost,
  Pentest,
  SecurityEvent,
  SiteContent,
  StudentProfile,
  Subscription,
  User,
} from '../models/index.js';
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

const getDateKey = (value = new Date()) => {
  const date = new Date(value);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const computeStreak = (dateKeys = []) => {
  if (!Array.isArray(dateKeys) || !dateKeys.length) return 0;
  const sorted = [...new Set(dateKeys)]
    .map((item) => new Date(`${item}T00:00:00.000Z`))
    .sort((a, b) => b.getTime() - a.getTime());
  if (!sorted.length) return 0;

  const today = new Date(`${getDateKey()}T00:00:00.000Z`);
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const first = sorted[0].getTime();
  if (first !== today.getTime() && first !== yesterday.getTime()) return 0;

  let streak = 1;
  for (let i = 1; i < sorted.length; i += 1) {
    const diff = sorted[i - 1].getTime() - sorted[i].getTime();
    if (diff === 24 * 60 * 60 * 1000) streak += 1;
    else break;
  }
  return streak;
};

const resolveRank = (xp) => {
  if (xp >= 1500) return 'Vanguard';
  if (xp >= 900) return 'Architect';
  if (xp >= 450) return 'Specialist';
  if (xp >= 150) return 'Contributor';
  return 'Candidate';
};

const escapeRegExp = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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

// GET /public/content/team
router.get('/content/team', async (_req, res, next) => {
  try {
    const content = await getSiteContent();
    res.json({ team: content.team || {} });
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

// GET /public/community-profiles/:handle
router.get('/community-profiles/:handle', async (req, res, next) => {
  try {
    const raw = String(req.params.handle || '').trim().replace(/^@/, '');
    const safeHandle = raw.replace(/[^a-z0-9._-]/gi, '');
    if (!safeHandle) {
      return res.status(400).json({ error: 'Handle is required' });
    }

    const handleRegex = new RegExp(`^${escapeRegExp(safeHandle)}$`, 'i');
    const user = await User.findOne({ hackerHandle: handleRegex, role: { $ne: 'admin' } })
      .select('_id name role organization avatarUrl hackerHandle bio createdAt')
      .lean();

    if (!user) {
      return res.status(404).json({ error: 'Profile not found' });
    }

    const userId = user._id;

    const [
      messageAgg,
      commentAgg,
      postAgg,
      messageLikesGivenAgg,
      postLikesGivenAgg,
      profile
    ] = await Promise.all([
      CommunityMessage.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: '$userId',
            messages: { $sum: 1 },
            likesReceived: { $sum: '$likes' },
            imagesShared: { $sum: { $cond: [{ $ne: ['$imageUrl', ''] }, 1, 0] } }
          }
        }
      ]),
      CommunityMessage.aggregate([
        { $unwind: '$comments' },
        { $match: { 'comments.userId': userId } },
        {
          $group: {
            _id: '$comments.userId',
            commentsMade: { $sum: 1 }
          }
        }
      ]),
      CommunityPost.aggregate([
        { $match: { 'metadata.authorId': userId } },
        {
          $group: {
            _id: '$metadata.authorId',
            posts: { $sum: 1 }
          }
        }
      ]),
      CommunityMessage.aggregate([
        { $unwind: '$likedBy' },
        { $match: { likedBy: userId } },
        {
          $group: {
            _id: '$likedBy',
            likesGiven: { $sum: 1 }
          }
        }
      ]),
      CommunityPost.aggregate([
        { $unwind: '$likedBy' },
        { $match: { likedBy: userId } },
        {
          $group: {
            _id: '$likedBy',
            likesGiven: { $sum: 1 }
          }
        }
      ]),
      StudentProfile.findOne({ userId })
        .select('userId snapshot.activity.visitDates')
        .lean()
    ]);

    const stats = messageAgg[0] || { messages: 0, likesReceived: 0, imagesShared: 0 };
    const commentsMade = commentAgg[0]?.commentsMade || 0;
    const posts = postAgg[0]?.posts || 0;
    const likesGiven =
      (messageLikesGivenAgg[0]?.likesGiven || 0) + (postLikesGivenAgg[0]?.likesGiven || 0);
    const visitDates = Array.isArray(profile?.snapshot?.activity?.visitDates)
      ? profile.snapshot.activity.visitDates
      : [];
    const trimmedVisitDates = visitDates.slice(-120);
    const visits = visitDates.length;
    const streakDays = computeStreak(visitDates);
    const totalXp =
      Number(stats.messages || 0) * 5 +
      Number(posts || 0) * 8 +
      Number(likesGiven || 0) * 2 +
      Number(commentsMade || 0) * 3 +
      Number(visits || 0);

    return res.json({
      profile: {
        id: String(user._id),
        name: user.name || 'Community Member',
        role: user.role || 'member',
        organization: user.organization || '',
        avatarUrl: user.avatarUrl || '',
        hackerHandle: user.hackerHandle || '',
        bio: user.bio || '',
      },
      stats: {
        messages: Number(stats.messages || 0),
        likesReceived: Number(stats.likesReceived || 0),
        commentsMade: Number(commentsMade || 0),
        imagesShared: Number(stats.imagesShared || 0),
        posts: Number(posts || 0),
        likesGiven: Number(likesGiven || 0),
      },
      xpSummary: {
        totalXp,
        rank: resolveRank(totalXp),
        streakDays,
        visits,
      },
      activity: {
        visitDates: trimmedVisitDates,
      },
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

    const userIdsForQuery = users.map((user) => user._id);
    const [postAgg, messageLikesGivenAgg, postLikesGivenAgg, profiles] = await Promise.all([
      CommunityPost.aggregate([
        {
          $group: {
            _id: '$metadata.authorId',
            posts: { $sum: 1 },
          }
        }
      ]),
      CommunityMessage.aggregate([
        { $unwind: '$likedBy' },
        {
          $group: {
            _id: '$likedBy',
            likesGiven: { $sum: 1 },
          }
        }
      ]),
      CommunityPost.aggregate([
        { $unwind: '$likedBy' },
        {
          $group: {
            _id: '$likedBy',
            likesGiven: { $sum: 1 },
          }
        }
      ]),
      StudentProfile.find({ userId: { $in: userIdsForQuery } }).select('userId snapshot.activity.visitDates').lean(),
    ]);

    const postsMap = new Map(
      postAgg.map((row) => [String(row._id || ''), Number(row.posts || 0)])
    );
    const messageLikesGivenMap = new Map(
      messageLikesGivenAgg.map((row) => [String(row._id || ''), Number(row.likesGiven || 0)])
    );
    const postLikesGivenMap = new Map(
      postLikesGivenAgg.map((row) => [String(row._id || ''), Number(row.likesGiven || 0)])
    );
    const profileMap = new Map(profiles.map((item) => [String(item.userId || ''), item]));

    const payload = users.map((user) => {
      const userId = user._id.toString();
      const stats = statsMap.get(String(user._id)) || {
        messages: 0,
        likesReceived: 0,
        imagesShared: 0,
      };
      const posts = postsMap.get(userId) || 0;
      const likesGiven = (messageLikesGivenMap.get(userId) || 0) + (postLikesGivenMap.get(userId) || 0);
      const commentsMade = commentsMap.get(String(user._id)) || 0;
      const profile = profileMap.get(userId);
      const visitDates = Array.isArray(profile?.snapshot?.activity?.visitDates)
        ? profile.snapshot.activity.visitDates
        : [];
      const visits = visitDates.length;
      const streakDays = computeStreak(visitDates);
      const totalXp =
        Number(stats.messages || 0) * 5 +
        Number(posts || 0) * 8 +
        Number(likesGiven || 0) * 2 +
        Number(commentsMade || 0) * 3 +
        Number(visits || 0);

      return {
        id: userId,
        name: user.name || 'Community Member',
        role: user.role || 'member',
        organization: user.organization || '',
        avatarUrl: user.avatarUrl || '',
        hackerHandle: user.hackerHandle || '',
        bio: user.bio || '',
        xpSummary: {
          totalXp,
          rank: resolveRank(totalXp),
          streakDays,
          visits,
        },
        stats: {
          messages: stats.messages,
          likesReceived: stats.likesReceived,
          commentsMade,
          imagesShared: stats.imagesShared,
        }
      };
    });

    res.json({ profiles: payload });
  } catch (err) {
    next(err);
  }
});

// GET /public/leaderboard
router.get('/leaderboard', async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit || 25);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 100) : 25;

    const [
      messageAgg,
      postAgg,
      commentAgg,
      messageLikesGivenAgg,
      postLikesGivenAgg,
      profiles,
    ] = await Promise.all([
      CommunityMessage.aggregate([
        {
          $group: {
            _id: '$userId',
            messages: { $sum: 1 },
          }
        }
      ]),
      CommunityPost.aggregate([
        {
          $group: {
            _id: '$metadata.authorId',
            posts: { $sum: 1 },
          }
        }
      ]),
      CommunityMessage.aggregate([
        { $unwind: '$comments' },
        {
          $group: {
            _id: '$comments.userId',
            comments: { $sum: 1 }
          }
        }
      ]),
      CommunityMessage.aggregate([
        { $unwind: '$likedBy' },
        {
          $group: {
            _id: '$likedBy',
            likesGiven: { $sum: 1 },
          }
        }
      ]),
      CommunityPost.aggregate([
        { $unwind: '$likedBy' },
        {
          $group: {
            _id: '$likedBy',
            likesGiven: { $sum: 1 },
          }
        }
      ]),
      StudentProfile.find()
        .select('userId snapshot.activity.visitDates')
        .lean(),
    ]);

    const messagesMap = new Map(
      messageAgg.map((row) => [String(row._id || ''), Number(row.messages || 0)])
    );
    const postsMap = new Map(
      postAgg.map((row) => [String(row._id || ''), Number(row.posts || 0)])
    );
    const commentsMap = new Map(
      commentAgg.map((row) => [String(row._id || ''), Number(row.comments || 0)])
    );
    const messageLikesGivenMap = new Map(
      messageLikesGivenAgg.map((row) => [String(row._id || ''), Number(row.likesGiven || 0)])
    );
    const postLikesGivenMap = new Map(
      postLikesGivenAgg.map((row) => [String(row._id || ''), Number(row.likesGiven || 0)])
    );
    const profileMap = new Map(profiles.map((item) => [String(item.userId || ''), item]));

    const userIds = new Set([
      ...messagesMap.keys(),
      ...postsMap.keys(),
      ...commentsMap.keys(),
      ...messageLikesGivenMap.keys(),
      ...postLikesGivenMap.keys(),
      ...profileMap.keys(),
    ].filter(Boolean));

    let users = [];
    const validUserIds = [...userIds].filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validUserIds.length) {
      users = await User.find({ _id: { $in: validUserIds }, role: { $ne: 'admin' } })
        .select('_id name role organization avatarUrl hackerHandle createdAt')
        .lean();
    }

    if (!users.length) {
      users = await User.find({ role: { $ne: 'admin' } })
        .sort({ createdAt: -1 })
        .limit(limit)
        .select('_id name role organization avatarUrl hackerHandle createdAt')
        .lean();
    }

    const leaderboard = users
      .map((user) => {
        const userId = String(user._id || '');
        const messages = messagesMap.get(userId) || 0;
        const posts = postsMap.get(userId) || 0;
        const comments = commentsMap.get(userId) || 0;
        const likesGiven =
          (messageLikesGivenMap.get(userId) || 0) + (postLikesGivenMap.get(userId) || 0);
        const profile = profileMap.get(userId);
        const visitDates = Array.isArray(profile?.snapshot?.activity?.visitDates)
          ? profile.snapshot.activity.visitDates
          : [];
        const visits = visitDates.length;
        const streakDays = computeStreak(visitDates);
        const totalXp =
          Number(messages || 0) * 5 +
          Number(posts || 0) * 8 +
          Number(likesGiven || 0) * 2 +
          Number(comments || 0) * 3 +
          Number(visits || 0);

        return {
          id: userId,
          name: user.name || 'Community Member',
          handle: user.hackerHandle || '',
          rank: resolveRank(totalXp),
          totalXp,
          streakDays,
          avatarUrl: user.avatarUrl || '',
        };
      })
      .sort((a, b) => {
        if (b.totalXp !== a.totalXp) return b.totalXp - a.totalXp;
        if (b.streakDays !== a.streakDays) return b.streakDays - a.streakDays;
        return a.name.localeCompare(b.name);
      })
      .slice(0, limit);

    res.json({
      leaderboard,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
