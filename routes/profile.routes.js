/**
 * Profile Routes
 * Matches frontend API_ENDPOINTS.PROFILE
 * SECURITY UPDATE IMPLEMENTED: Change password with strong validation, logging
 */
import { Router } from 'express';
import { CommunityMessage, CommunityPost, StudentProfile, User } from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import * as authService from '../services/auth.service.js';
import { SecurityEvent } from '../models/index.js';
import { validatePasswordStrength } from '../utils/security.js';

const router = Router();

router.use(requireAuth);

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

const getUnlockedEmblems = (progressState = {}) => {
  const modules = progressState?.modules || {};
  return Object.entries(modules)
    .filter(([, value]) => Boolean(value?.ctfCompleted))
    .map(([moduleId]) => Number(moduleId))
    .sort((a, b) => a - b);
};

const buildProfilePayload = async (user) => {
  const profile = await StudentProfile.findOne({ userId: user._id }).lean();
  const snapshot = profile?.snapshot && typeof profile.snapshot === 'object' ? profile.snapshot : {};
  const progressState = snapshot.progressState && typeof snapshot.progressState === 'object'
    ? snapshot.progressState
    : {};
  const visitDates = Array.isArray(snapshot?.activity?.visitDates)
    ? snapshot.activity.visitDates
    : [];

  const [messagesCount, postsCount, messageLikesGiven, postLikesGiven, commentCount] = await Promise.all([
    CommunityMessage.countDocuments({ userId: user._id }),
    CommunityPost.countDocuments({ 'metadata.authorId': String(user._id) }),
    CommunityMessage.countDocuments({ likedBy: user._id }),
    CommunityPost.countDocuments({ likedBy: user._id }),
    CommunityMessage.countDocuments({ 'comments.userId': user._id }),
  ]);

  const likesGiven = Number(messageLikesGiven || 0) + Number(postLikesGiven || 0);
  const visits = visitDates.length;
  const streakDays = computeStreak(visitDates);
  const totalXp =
    Number(messagesCount || 0) * 5 +
    Number(postsCount || 0) * 8 +
    likesGiven * 2 +
    Number(commentCount || 0) * 3 +
    visits;
  const unlockedEmblems = getUnlockedEmblems(progressState);

  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name || '',
    organization: user.organization || '',
    avatarUrl: user.avatarUrl || '',
    bootcampStatus: user.bootcampStatus || 'not_enrolled',
    bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
    role: user.role,
    hackerHandle: user.hackerHandle || '',
    bio: user.bio || '',
    xpSummary: {
      totalXp,
      rank: resolveRank(totalXp),
      streakDays,
      visits,
    },
    emblems: {
      unlockedModules: unlockedEmblems,
      graduationUnlocked: unlockedEmblems.length >= 5,
    },
  };
};

// GET /profile
router.get('/', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await buildProfilePayload(user));
  } catch (err) {
    next(err);
  }
});

// PUT /profile
router.put('/', async (req, res, next) => {
  try {
    const updates = {};
    if (typeof req.body?.name === 'string') updates.name = req.body.name.trim();
    if (typeof req.body?.organization === 'string') {
      updates.organization = req.body.organization.trim();
    }
    if (typeof req.body?.hackerHandle === 'string') {
      updates.hackerHandle = req.body.hackerHandle.trim();
    }
    if (typeof req.body?.bio === 'string') {
      updates.bio = req.body.bio.trim();
    }
    if (req.user.role === 'admin' && req.body?.role) updates.role = req.body.role;
    const user = await User.findByIdAndUpdate(req.user.id, { $set: updates }, { new: true }).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await buildProfilePayload(user));
  } catch (err) {
    next(err);
  }
});

// PUT /profile/avatar
router.put('/avatar', async (req, res, next) => {
  try {
    const avatarUrl = typeof req.body?.avatarUrl === 'string'
      ? req.body.avatarUrl.trim()
      : typeof req.body?.avatar === 'string'
        ? req.body.avatar.trim()
        : '';

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { avatarUrl } },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await buildProfilePayload(user));
  } catch (err) {
    next(err);
  }
});

// DELETE /profile/avatar
router.delete('/avatar', async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $set: { avatarUrl: '' } },
      { new: true }
    ).lean();

    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(await buildProfilePayload(user));
  } catch (err) {
    next(err);
  }
});

// PUT /profile/password - SECURITY UPDATE IMPLEMENTED: Strong password, log change
router.put('/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current and new password are required' });
    }
    const pwdCheck = validatePasswordStrength(newPassword);
    if (!pwdCheck.valid) {
      return res.status(400).json({ error: pwdCheck.message });
    }
    await authService.changePassword(req.user.id, currentPassword, newPassword);
    SecurityEvent.create({
      eventType: 'password_update',
      action: 'change_password_profile',
      path: '/profile/password',
      method: 'PUT',
      statusCode: 200,
      ipAddress: req.requestContext?.ipAddress || req.ip || '',
      userAgent: String(req.headers['user-agent'] || '').slice(0, 512),
      userId: req.user.id,
    }).catch(() => {});
    res.json({ success: true });
  } catch (err) {
    if (err.status) {
      return res.status(err.status).json({ error: err.message });
    }
    next(err);
  }
});

// DELETE /profile
router.delete('/', async (req, res, next) => {
  try {
    await User.findByIdAndDelete(req.user.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;
