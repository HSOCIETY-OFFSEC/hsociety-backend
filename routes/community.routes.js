/**
 * Community Routes
 * Matches frontend API_ENDPOINTS.COMMUNITY
 */
import { Router } from 'express';
import { CommunityConfig, CommunityPost } from '../models/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

const DEFAULT_CHANNELS = [
  { id: 'intro', name: 'Introductions' },
  { id: 'beginner', name: 'Beginner Q&A' },
  { id: 'ctf', name: 'CTF Talk' },
  { id: 'blue-team', name: 'Blue Team' },
  { id: 'red-team', name: 'Red Team' },
];

const DEFAULT_TAGS = [
  '#career-switch',
  '#ctf',
  '#web-security',
  '#blue-team',
  '#owasp',
  '#interview-prep',
];

const DEFAULT_MENTOR = {
  id: 'ria',
  name: 'Ria N.',
  role: 'Blue Team Lead',
  avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80',
};

const DEFAULT_CHALLENGE_STUDENT = {
  id: 'weekly',
  title: 'Challenge of the Week',
  description: 'Break down a real-world phishing sample and map it to MITRE.',
};

const DEFAULT_CHALLENGE_CORP = {
  id: 'weekly',
  title: 'Top Learner Highlights',
  description: 'See the most active learners and award mentorship credits.',
};

const ensureConfig = async () => {
  let config = await CommunityConfig.findOne().lean();
  if (!config) {
    config = await CommunityConfig.create({
      stats: { learners: 12000, questions: 4000, answered: 1300 },
      channels: DEFAULT_CHANNELS,
      tags: DEFAULT_TAGS,
      mentor: DEFAULT_MENTOR,
      challengeStudent: DEFAULT_CHALLENGE_STUDENT,
      challengeCorporate: DEFAULT_CHALLENGE_CORP,
    });
    return config.toObject();
  }
  return config;
};

const toPostResponse = (post, viewerId) => ({
  id: post._id.toString(),
  author: post.authorName || 'Community Member',
  role: post.authorRole || 'Security Learner',
  time: post.createdAt ? post.createdAt.toISOString() : 'just now',
  title: post.title || 'Untitled post',
  body: post.body || '',
  likes: Number(post.likes || 0),
  replies: Number(post.replies || 0),
  tags: post.tags || [],
  avatar:
    post.authorAvatar ||
    'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=200&q=80',
  isSaved: viewerId ? (post.savedBy || []).some((id) => id.toString() === viewerId) : false,
});

// GET /community/overview
router.get('/overview', optionalAuth, async (req, res, next) => {
  try {
    const role = req.query.role || 'student';
    const feed = req.query.feed || 'popular';
    const viewerId = req.user?.id;

    const config = await ensureConfig();
    let query = CommunityPost.find();
    if (feed === 'saved' && viewerId) {
      query = query.where({ savedBy: viewerId });
    }

    if (feed === 'new') {
      query = query.sort({ createdAt: -1 });
    } else if (feed === 'popular') {
      query = query.sort({ likes: -1, createdAt: -1 });
    }

    const posts = await query.limit(30).lean();
    res.json({
      stats: config.stats || {},
      channels: config.channels?.length ? config.channels : DEFAULT_CHANNELS,
      tags: config.tags?.length ? config.tags : DEFAULT_TAGS,
      posts: posts.map((post) => toPostResponse(post, viewerId)),
      mentor: config.mentor || DEFAULT_MENTOR,
      challenge:
        role === 'corporate'
          ? config.challengeCorporate || DEFAULT_CHALLENGE_CORP
          : config.challengeStudent || DEFAULT_CHALLENGE_STUDENT,
    });
  } catch (err) {
    next(err);
  }
});

// GET /community/posts
router.get('/posts', optionalAuth, async (req, res, next) => {
  try {
    const posts = await CommunityPost.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(posts.map((post) => toPostResponse(post, req.user?.id)));
  } catch (err) {
    next(err);
  }
});

// POST /community/posts
router.post('/posts', requireAuth, async (req, res, next) => {
  try {
    const content = String(req.body?.content || '').trim();
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const title = content.split(' ').slice(0, 6).join(' ') || 'Community post';
    const doc = await CommunityPost.create({
      authorName: req.user?.name || 'Community Member',
      authorRole: req.body?.roleContext === 'corporate' ? 'Corporate Member' : 'Student Member',
      authorAvatar: '',
      title,
      body: content,
      tags: req.body?.tags || [],
      visibility: req.body?.visibility || 'public',
      roleContext: req.body?.roleContext || 'student',
      attachments: req.body?.attachments || [],
      metadata: req.body?.metadata || {},
    });

    res.status(201).json(toPostResponse(doc.toObject(), req.user?.id));
  } catch (err) {
    next(err);
  }
});

// POST /community/posts/:id/react
router.post('/posts/:id/react', requireAuth, async (req, res, next) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.id;
    const alreadyLiked = post.likedBy.some((id) => id.toString() === userId);
    if (alreadyLiked) {
      post.likedBy = post.likedBy.filter((id) => id.toString() !== userId);
      post.likes = Math.max(0, post.likes - 1);
    } else {
      post.likedBy.push(userId);
      post.likes += 1;
    }

    await post.save();
    res.json({ success: true, likes: post.likes });
  } catch (err) {
    next(err);
  }
});

// POST /community/posts/:id/save
router.post('/posts/:id/save', requireAuth, async (req, res, next) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const userId = req.user.id;
    const shouldSave = Boolean(req.body?.saved);
    const alreadySaved = post.savedBy.some((id) => id.toString() === userId);

    if (shouldSave && !alreadySaved) {
      post.savedBy.push(userId);
    }
    if (!shouldSave && alreadySaved) {
      post.savedBy = post.savedBy.filter((id) => id.toString() !== userId);
    }

    await post.save();
    res.json({ success: true, saved: shouldSave });
  } catch (err) {
    next(err);
  }
});

export default router;
