/**
 * Admin Routes
 */
import { Router } from 'express';
import { Audit, CommunityConfig, CommunityMessage, CommunityPost, Feedback, Notification, Pentest, SecurityEvent, SiteContent, User } from '../models/index.js';
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
  bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
  mutedUntil: user.mutedUntil || null,
  createdAt: user.createdAt,
});

const resolveAudienceRoles = (audience = 'all') => {
  if (audience === 'students') return ['student'];
  if (audience === 'organizers') return ['admin', 'corporate', 'pentester'];
  return ['student', 'admin', 'corporate', 'pentester'];
};

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
    if (
      req.body?.bootcampPaymentStatus &&
      ['unpaid', 'pending', 'paid'].includes(req.body.bootcampPaymentStatus)
    ) {
      updates.bootcampPaymentStatus = req.body.bootcampPaymentStatus;
      if (req.body.bootcampPaymentStatus === 'paid') {
        updates.bootcampPaidAt = new Date();
      } else if (req.body.bootcampPaymentStatus === 'unpaid') {
        updates.bootcampPaidAt = null;
      }
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
    if (req.body?.terms && typeof req.body.terms === 'object') {
      updates['terms.effectiveDate'] = String(req.body.terms.effectiveDate || '').trim();
      updates['terms.lastUpdated'] = String(req.body.terms.lastUpdated || '').trim();
      updates['terms.jurisdiction'] = String(req.body.terms.jurisdiction || '').trim();
      if (Array.isArray(req.body.terms.sections)) {
        updates['terms.sections'] = req.body.terms.sections.map((section) => ({
          title: String(section.title || '').trim(),
          body: String(section.body || '').trim(),
          bullets: Array.isArray(section.bullets)
            ? section.bullets.map((item) => String(item || '').trim()).filter(Boolean)
            : []
        })).filter((section) => section.title && (section.body || section.bullets?.length));
      }
    }
    if (req.body?.learn && typeof req.body.learn === 'object') {
      if (Array.isArray(req.body.learn.freeResources)) {
        updates['learn.freeResources'] = req.body.learn.freeResources
          .map((item) => ({
            title: String(item?.title || '').trim(),
            description: String(item?.description || '').trim(),
            url: String(item?.url || '').trim(),
            type: String(item?.type || 'link').trim() || 'link',
          }))
          .filter((item) => item.title);
      }
      if (req.body.learn.freeResourcesMessage !== undefined) {
        updates['learn.freeResourcesMessage'] = String(req.body.learn.freeResourcesMessage || '').trim();
      }
      if (req.body.learn.bootcampMeetingUrl !== undefined) {
        updates['learn.bootcampMeetingUrl'] = String(req.body.learn.bootcampMeetingUrl || '').trim();
      }
      if (req.body.learn.bootcampMeetingMessage !== undefined) {
        updates['learn.bootcampMeetingMessage'] = String(req.body.learn.bootcampMeetingMessage || '').trim();
      }
    }
    if (req.body?.team && typeof req.body.team === 'object') {
      const team = req.body.team;
      if (team.hero && typeof team.hero === 'object') {
        updates['team.hero.kicker'] = String(team.hero.kicker || '').trim();
        updates['team.hero.title'] = String(team.hero.title || '').trim();
        updates['team.hero.subtitle'] = String(team.hero.subtitle || '').trim();
        updates['team.hero.button'] = String(team.hero.button || '').trim();
        updates['team.hero.route'] = String(team.hero.route || '').trim();
      }
      if (team.leadership && typeof team.leadership === 'object') {
        updates['team.leadership.title'] = String(team.leadership.title || '').trim();
        updates['team.leadership.subtitle'] = String(team.leadership.subtitle || '').trim();
        if (Array.isArray(team.leadership.members)) {
          updates['team.leadership.members'] = team.leadership.members
            .map((member) => ({
              name: String(member?.name || '').trim(),
              role: String(member?.role || '').trim(),
              focus: String(member?.focus || '').trim(),
              icon: String(member?.icon || '').trim(),
              image: String(member?.image || '').trim(),
              socials: Array.isArray(member?.socials)
                ? member.socials
                    .map((social) => ({
                      platform: String(social?.platform || '').trim(),
                      url: String(social?.url || '').trim(),
                    }))
                    .filter((social) => social.platform && social.url)
                : []
            }))
            .filter((member) => member.name);
        }
      }
      if (team.groups && typeof team.groups === 'object') {
        updates['team.groups.title'] = String(team.groups.title || '').trim();
        updates['team.groups.subtitle'] = String(team.groups.subtitle || '').trim();
        if (Array.isArray(team.groups.items)) {
          updates['team.groups.items'] = team.groups.items
            .map((item) => ({
              title: String(item?.title || '').trim(),
              description: String(item?.description || '').trim(),
              icon: String(item?.icon || '').trim(),
            }))
            .filter((item) => item.title && item.description);
        }
      }
      if (team.cta && typeof team.cta === 'object') {
        updates['team.cta.title'] = String(team.cta.title || '').trim();
        updates['team.cta.subtitle'] = String(team.cta.subtitle || '').trim();
        updates['team.cta.button'] = String(team.cta.button || '').trim();
        updates['team.cta.route'] = String(team.cta.route || '').trim();
      }
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

// POST /admin/notifications/send
router.post('/notifications/send', async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    const message = String(req.body?.message || '').trim();
    const audience = String(req.body?.audience || 'all').trim().toLowerCase();
    const type = String(req.body?.type || 'admin_message').trim();
    const metadata = req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : {};

    if (!title) return res.status(400).json({ error: 'Title is required' });
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const roles = resolveAudienceRoles(audience);
    const users = await User.find({ role: { $in: roles } }).select('_id').lean();
    if (!users.length) {
      return res.json({ success: true, sentCount: 0 });
    }

    await Notification.insertMany(
      users.map((user) => ({
        userId: user._id,
        type,
        title,
        message,
        metadata,
      }))
    );

    res.json({ success: true, sentCount: users.length });
  } catch (err) {
    next(err);
  }
});

// POST /admin/bootcamp/meeting
router.post('/bootcamp/meeting', async (req, res, next) => {
  try {
    const meetUrl = String(req.body?.meetUrl || '').trim();
    const meetingMessage = String(req.body?.message || '').trim();
    const audience = String(req.body?.audience || 'students').trim().toLowerCase();

    if (!meetUrl) return res.status(400).json({ error: 'Google Meet URL is required' });

    const safeMessage =
      meetingMessage || 'New live bootcamp meeting has been scheduled. Open this alert to join.';

    await SiteContent.findOneAndUpdate(
      { key: 'site' },
      {
        $set: {
          'learn.bootcampMeetingUrl': meetUrl,
          'learn.bootcampMeetingMessage': safeMessage,
          'learn.bootcampMeetingUpdatedAt': new Date(),
        },
      },
      { upsert: true, new: true }
    );

    const roles = resolveAudienceRoles(audience);
    const users = await User.find({ role: { $in: roles } }).select('_id').lean();
    if (users.length) {
      await Notification.insertMany(
        users.map((user) => ({
          userId: user._id,
          type: 'bootcamp_meeting',
          title: 'Bootcamp Live Session',
          message: safeMessage,
          metadata: { meetUrl, audience },
        }))
      );
    }

    res.json({ success: true, sentCount: users.length, meetUrl });
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

// GET /admin/security/events
router.get('/security/events', async (req, res, next) => {
  try {
    const limitRaw = Number(req.query.limit || 100);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 300) : 100;

    const events = await SecurityEvent.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'email name role')
      .lean();

    const payload = events.map((event) => ({
      id: event._id.toString(),
      createdAt: event.createdAt,
      eventType: event.eventType,
      action: event.action,
      path: event.path,
      statusCode: Number(event.statusCode || 0),
      ipAddress: event.ipAddress || '',
      macAddress: event.macAddress || 'unavailable',
      userAgent: event.userAgent || '',
      deviceId: event.deviceId || '',
      user: event.userId
        ? {
            id: event.userId._id?.toString?.() || '',
            email: event.userId.email || '',
            name: event.userId.name || '',
            role: event.userId.role || '',
          }
        : null,
      metadata: event.metadata || {},
    }));

    res.json({ items: payload, total: payload.length });
  } catch (err) {
    next(err);
  }
});

// GET /admin/security/summary
router.get('/security/summary', async (_req, res, next) => {
  try {
    const since = new Date(Date.now() - 1000 * 60 * 60 * 24);
    const [events24h, uniqueIpsAgg, authFailures, topActions, topPaths] = await Promise.all([
      SecurityEvent.countDocuments({ createdAt: { $gte: since } }),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: since }, ipAddress: { $nin: ['', null] } } },
        { $group: { _id: '$ipAddress' } },
        { $count: 'total' }
      ]),
      SecurityEvent.countDocuments({
        createdAt: { $gte: since },
        eventType: { $in: ['api_error', 'auth_failure'] },
      }),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: since } } },
        { $group: { _id: '$action', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      SecurityEvent.aggregate([
        { $match: { createdAt: { $gte: since }, path: { $nin: ['', null] } } },
        { $group: { _id: '$path', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
    ]);

    res.json({
      events24h,
      uniqueIps24h: uniqueIpsAgg?.[0]?.total || 0,
      authFailures24h: authFailures || 0,
      topActions: topActions.map((row) => ({ action: row._id || 'unknown', count: row.count || 0 })),
      topPaths: topPaths.map((row) => ({ path: row._id || 'unknown', count: row.count || 0 })),
      macAddressNote: 'Real client MAC addresses are not exposed by browsers on the public web.',
    });
  } catch (err) {
    next(err);
  }
});

export default router;
