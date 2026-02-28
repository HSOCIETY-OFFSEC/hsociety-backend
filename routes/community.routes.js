/**
 * Community Routes
 * Matches frontend API_ENDPOINTS.COMMUNITY
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { CommunityConfig, CommunityMessage, CommunityPost, User } from '../models/index.js';
import { optionalAuth, requireAuth } from '../middleware/auth.middleware.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadRoot = path.join(__dirname, '..', 'uploads', 'community');

if (!fs.existsSync(uploadRoot)) {
  fs.mkdirSync(uploadRoot, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadRoot),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.png';
      const safeName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
      cb(null, safeName);
    },
  }),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) return cb(null, true);
    return cb(new Error('Only image files are allowed'));
  },
});

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

    const [posts, userCount, messageCount, postCount] = await Promise.all([
      query.limit(30).lean(),
      User.countDocuments(),
      CommunityMessage.countDocuments(),
      CommunityPost.countDocuments(),
    ]);

    const totalPosts = Number(messageCount || 0) + Number(postCount || 0);
    const resolvedStats = {
      learners: Number(userCount || 0),
      questions: totalPosts,
      answered: Number(config?.stats?.answered || 0),
    };
    res.json({
      stats: resolvedStats,
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

// GET /community/posts/:id
router.get('/posts/:id', optionalAuth, async (req, res, next) => {
  try {
    const post = await CommunityPost.findById(req.params.id).lean();
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(toPostResponse(post, req.user?.id));
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

// POST /community/uploads
router.post('/uploads', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Image is required' });
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const url = `${baseUrl}/uploads/community/${req.file.filename}`;
  res.status(201).json({ url });
});

// GET /community/profile/:handle
router.get('/profile/:handle', requireAuth, async (req, res, next) => {
  try {
    const rawHandle = String(req.params.handle || '').trim();
    if (!rawHandle) return res.status(400).json({ error: 'Profile handle is required' });

    let user = await User.findOne({ hackerHandle: new RegExp(`^${rawHandle}$`, 'i') }).lean();

    if (!user && mongoose.Types.ObjectId.isValid(rawHandle)) {
      user = await User.findById(rawHandle).lean();
    }

    if (!user) return res.status(404).json({ error: 'User not found' });

    const userId = user._id;

    const [messagesCount, likesAgg, commentsMadeAgg, imagesCount, rooms] = await Promise.all([
      CommunityMessage.countDocuments({ userId }),
      CommunityMessage.aggregate([
        { $match: { userId } },
        { $group: { _id: null, total: { $sum: '$likes' } } }
      ]),
      CommunityMessage.aggregate([
        { $unwind: '$comments' },
        { $match: { 'comments.userId': userId } },
        { $group: { _id: null, total: { $sum: 1 } } }
      ]),
      CommunityMessage.countDocuments({ userId, imageUrl: { $ne: '' } }),
      CommunityMessage.distinct('room', { userId }),
    ]);

    const likesReceived = likesAgg?.[0]?.total || 0;
    const commentsMade = commentsMadeAgg?.[0]?.total || 0;

    res.json({
      user: {
        id: user._id.toString(),
        name: user.name || '',
        role: user.role || '',
        organization: user.organization || '',
        avatarUrl: user.avatarUrl || '',
        hackerHandle: user.hackerHandle || '',
        bio: user.bio || '',
        joinedAt: user.createdAt || null
      },
      stats: {
        messages: messagesCount || 0,
        likesReceived,
        commentsMade,
        imagesShared: imagesCount || 0,
        roomsActive: rooms?.length || 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /community/messages?room=general&limit=50
router.get('/messages', requireAuth, async (req, res, next) => {
  try {
    const room = String(req.query.room || 'general').trim();
    const limitRaw = Number(req.query.limit || 50);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 50;

    const messages = await CommunityMessage.find({ room })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({
      room,
      messages: messages.map((message) => ({
        id: message._id.toString(),
        userId: message.userId?.toString() || '',
        username: message.username,
        hackerHandle: message.hackerHandle || '',
        userRole: message.userRole || '',
        userAvatar: message.userAvatar || '',
        room: message.room,
        content: message.content,
        imageUrl: message.imageUrl || '',
        likes: Number(message.likes || 0),
        likedBy: (message.likedBy || []).map((id) => id.toString()),
        comments: (message.comments || []).map((comment) => ({
          id: comment._id?.toString() || '',
          userId: comment.userId?.toString() || '',
          username: comment.username || 'Community Member',
          content: comment.content || '',
          createdAt: comment.createdAt
        })),
        createdAt: message.createdAt
      }))
    });
  } catch (err) {
    next(err);
  }
});

// GET /community/channels
router.get('/channels', optionalAuth, async (_req, res, next) => {
  try {
    const config = await ensureConfig();
    res.json(config.channels?.length ? config.channels : DEFAULT_CHANNELS);
  } catch (err) {
    next(err);
  }
});

// GET /community/tags
router.get('/tags', optionalAuth, async (_req, res, next) => {
  try {
    const config = await ensureConfig();
    res.json(config.tags?.length ? config.tags : DEFAULT_TAGS);
  } catch (err) {
    next(err);
  }
});

export default router;
