/**
 * Student Routes
 * Matches frontend API_ENDPOINTS.STUDENT
 */
import { Router } from 'express';
import {
  Quiz,
  QuizSubmission,
  StudentCourse,
  StudentProfile,
  CommunityConfig,
  CommunityMessage,
  CommunityPost,
  SiteContent,
  User,
  BootcampPayment,
  Notification,
} from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { emitNotifications } from '../sockets/socket.store.js';
import {
  completeModule,
  deployProfessional,
  enrollTraining,
  joinCommunity,
  listSupervisedEngagements,
  refreshSkills,
} from '../services/student.lifecycle.service.js';

const router = Router();

const emptyProgressState = { modules: {} };

const DEFAULT_COURSE = {
  course: {
    id: 'become-a-hacker',
    title: 'Become a Hacker',
    creator: 'HsOCIETY',
    levelSystem: true,
    badgeSystem: true,
    modules: [
      {
        moduleId: 1,
        title: 'The Hacker Mindset & Learning Path',
        badge: 'Mindset Master',
        rooms: [
          { roomId: 1, title: 'The Hacker Mindset' },
          { roomId: 2, title: 'How to Learn Hacking Effectively' },
        ],
        ctf: 'Mindset CTF',
      },
      {
        moduleId: 2,
        title: 'Computer Networking Foundations',
        badge: 'Network Explorer',
        rooms: [
          { roomId: 3, title: 'Networking Basics' },
          { roomId: 4, title: 'Networking Intermediate' },
          { roomId: 5, title: 'Hacker Network Techniques' },
        ],
        ctf: 'Network Breach Lab',
      },
      {
        moduleId: 3,
        title: 'Linux & Terminal Mastery',
        badge: 'Linux Operator',
        rooms: [
          { roomId: 6, title: 'Linux Basics' },
          { roomId: 7, title: 'Linux Intermediate' },
          { roomId: 8, title: 'Terminal Basics' },
          { roomId: 9, title: 'Terminal Intermediate' },
        ],
        ctf: 'Linux Survival CTF',
      },
      {
        moduleId: 4,
        title: 'Web & Backend Systems',
        badge: 'Web Architect',
        rooms: [
          { roomId: 10, title: 'How the Web Works' },
          { roomId: 11, title: 'Website Architecture' },
          { roomId: 12, title: 'Backend Basics' },
          { roomId: 13, title: 'Backend Intermediate' },
          { roomId: 14, title: 'Building a Full Stack App' },
        ],
        ctf: 'Web Exploitation Lab',
      },
      {
        moduleId: 5,
        title: 'Psychology & Social Engineering',
        badge: 'Human Hacker',
        rooms: [
          { roomId: 15, title: 'Psychology in Hacking' },
          { roomId: 16, title: 'Social Engineering Basics' },
          { roomId: 17, title: 'Social Engineering Intermediate' },
          { roomId: 18, title: 'Social Engineering Practice' },
        ],
        ctf: 'Social Breach Simulation',
      },
    ],
    certification: 'Certified HSOCIETY Hacker',
  },
};

const buildDefaultQuiz = ({ type, id, courseId }) => ({
  scope: { type, id, courseId },
  questions: [
    {
      id: 'q1',
      text: 'What is the primary mindset of an ethical hacker?',
      options: [
        'Break everything without limits',
        'Think like an attacker while respecting boundaries',
        'Ignore rules to find vulnerabilities',
        'Automate all security work',
      ],
      correctIndex: 1,
    },
    {
      id: 'q2',
      text: 'What is the most important first step when learning a new hacking topic?',
      options: [
        'Memorize every tool command',
        'Run tools blindly until something works',
        'Understand the underlying system and threat model',
        'Skip basics and jump into advanced exploits',
      ],
      correctIndex: 2,
    },
  ],
});

router.use(requireAuth);

router.use((req, res, next) => {
  if (req.user.role !== 'student' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Student access required' });
  }
  return next();
});

const BOOTCAMP_PRICE_GHS = Number(process.env.BOOTCAMP_PRICE_GHS || 150);
const BOOTCAMP_CURRENCY = process.env.BOOTCAMP_CURRENCY || 'GHS';
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const XP_RULES = {
  room: 100,
  ctf: 250,
};

const getFrontendBaseUrl = () => {
  const base = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.trim()
    : (process.env.FRONTEND_URLS || '').split(',').map((item) => item.trim()).filter(Boolean)[0];
  return base || 'http://localhost:5173';
};

const buildPaystackCallbackUrl = () => {
  const base = getFrontendBaseUrl().replace(/\/+$/, '');
  return `${base}/student-payments`;
};

const mapPaymentMethodToChannels = (method) => {
  switch (method) {
    case 'momo':
    case 'telcel':
      return ['mobile_money'];
    case 'bank':
      return ['bank_transfer', 'bank'];
    default:
      return ['card', 'bank_transfer', 'mobile_money'];
  }
};

const getDateKey = (value = new Date()) => {
  const date = new Date(value);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const computeStreak = (dateKeys = []) => {
  if (!Array.isArray(dateKeys) || dateKeys.length === 0) return 0;
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
    const prev = sorted[i - 1];
    const current = sorted[i];
    if (prev.getTime() - current.getTime() === 24 * 60 * 60 * 1000) {
      streak += 1;
    } else {
      break;
    }
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

const computeLearningXp = (course, progressState) => {
  if (!course || !progressState) return 0;
  let xp = 0;
  const modules = Array.isArray(course.modules) ? course.modules : [];
  modules.forEach((module) => {
    const moduleProgress = progressState.modules?.[module.moduleId] || { rooms: {}, ctfCompleted: false };
    (module.rooms || []).forEach((room) => {
      if (moduleProgress.rooms?.[room.roomId]) {
        xp += XP_RULES.room;
      }
    });
    if (moduleProgress.ctfCompleted) {
      xp += XP_RULES.ctf;
    }
  });
  return xp;
};

const buildXpSummary = async (userId, visitDates = [], learningXp = 0) => {
  const [messagesCount, postsCount, messageLikesGiven, postLikesGiven, commentCount] = await Promise.all([
    CommunityMessage.countDocuments({ userId }),
    CommunityPost.countDocuments({ 'metadata.authorId': String(userId) }),
    CommunityMessage.countDocuments({ likedBy: userId }),
    CommunityPost.countDocuments({ likedBy: userId }),
    CommunityMessage.countDocuments({ 'comments.userId': userId }),
  ]);

  const likesGiven = Number(messageLikesGiven || 0) + Number(postLikesGiven || 0);
  const visits = Array.isArray(visitDates) ? visitDates.length : 0;
  const streakDays = computeStreak(visitDates);

  const communityXp =
    Number(messagesCount || 0) * 5 +
    Number(postsCount || 0) * 8 +
    likesGiven * 2 +
    Number(commentCount || 0) * 3 +
    visits;
  const totalXp = communityXp + Number(learningXp || 0);

  return {
    totalXp,
    rank: resolveRank(totalXp),
    streakDays,
    visits,
    learningXp: Number(learningXp || 0),
    breakdown: {
      messages: Number(messagesCount || 0),
      posts: Number(postsCount || 0),
      likesGiven,
      comments: Number(commentCount || 0),
      visits,
      learningXp: Number(learningXp || 0),
      communityXp,
    },
  };
};

const notifyXpAndRankIfChanged = async (userId, nextSummary, snapshot) => {
  const previous = snapshot?.stats?.xpSummary || null;
  const notifications = [];

  if (previous && Number(nextSummary.totalXp) > Number(previous.totalXp || 0)) {
    const delta = Number(nextSummary.totalXp) - Number(previous.totalXp || 0);
    notifications.push({
      userId,
      type: 'xp_earned',
      title: 'XP earned',
      message: `You earned ${delta} XP. Total XP is now ${nextSummary.totalXp}.`,
      metadata: { delta, totalXp: nextSummary.totalXp },
    });
  }

  if (previous && previous.rank && nextSummary.rank && previous.rank !== nextSummary.rank) {
    notifications.push({
      userId,
      type: 'rank_change',
      title: 'Rank updated',
      message: `Your rank changed from ${previous.rank} to ${nextSummary.rank}.`,
      metadata: { previousRank: previous.rank, rank: nextSummary.rank, totalXp: nextSummary.totalXp },
    });
  }

  const updatedSnapshot = {
    ...(snapshot || {}),
    stats: {
      ...(snapshot?.stats || {}),
      xpSummary: {
        ...nextSummary,
        updatedAt: new Date().toISOString(),
      },
    },
  };

  await StudentProfile.findOneAndUpdate(
    { userId },
    { $set: { snapshot: updatedSnapshot } },
    { upsert: true, new: true }
  );

  if (notifications.length > 0) {
    const inserted = await Notification.insertMany(notifications);
    emitNotifications(inserted);
  }

  return updatedSnapshot;
};

const upsertVisitAndGetSummary = async (userId) => {
  const todayKey = getDateKey();
  const profile = await StudentProfile.findOne({ userId });
  const snapshot = profile?.snapshot && typeof profile.snapshot === 'object' ? profile.snapshot : {};
  const activity = snapshot.activity && typeof snapshot.activity === 'object' ? snapshot.activity : {};
  const visitDates = Array.isArray(activity.visitDates) ? activity.visitDates.filter(Boolean) : [];

  if (!visitDates.includes(todayKey)) {
    visitDates.push(todayKey);
  }

  const trimmedVisitDates = visitDates.slice(-120);
  const updatedSnapshot = {
    ...snapshot,
    activity: {
      ...activity,
      visitDates: trimmedVisitDates,
      lastVisitAt: new Date().toISOString(),
    },
  };

  const progressState = getProgressState(updatedSnapshot);
  const course = await ensureCourse();
  const learningXp = computeLearningXp(course.course || course, progressState);
  const xpSummary = await buildXpSummary(userId, trimmedVisitDates, learningXp);
  await notifyXpAndRankIfChanged(userId, xpSummary, updatedSnapshot);
  return xpSummary;
};

const requireBootcampRegistration = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const user = await User.findById(req.user.id).select('bootcampStatus bootcampPaymentStatus').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.bootcampStatus === 'not_enrolled') {
    return res.status(403).json({ error: 'Bootcamp registration required', code: 'bootcamp_registration_required' });
  }
  req.bootcampAccess = {
    registered: true,
    paid: user.bootcampPaymentStatus === 'paid',
  };
  return next();
};

const requireBootcampAccess = async (req, res, next) => {
  if (req.user.role === 'admin') return next();
  const user = await User.findById(req.user.id).select('bootcampStatus bootcampPaymentStatus').lean();
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.bootcampStatus === 'not_enrolled') {
    return res.status(403).json({ error: 'Bootcamp registration required', code: 'bootcamp_registration_required' });
  }
  if (user.bootcampPaymentStatus !== 'paid') {
    return res.status(403).json({ error: 'Bootcamp payment required', code: 'bootcamp_payment_required' });
  }
  return next();
};

const initializePaystackTransaction = async ({ email, amount, reference, channels, metadata }) => {
  if (!PAYSTACK_SECRET_KEY) {
    const err = new Error('Paystack secret key missing');
    err.status = 500;
    throw err;
  }

  const payload = {
    email,
    amount: Math.round(Number(amount) * 100),
    currency: BOOTCAMP_CURRENCY,
    reference,
    channels,
    callback_url: buildPaystackCallbackUrl(),
    metadata: metadata || {},
  };

  const response = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!response.ok || !data.status) {
    const err = new Error(data?.message || 'Paystack initialization failed');
    err.status = response.status || 500;
    throw err;
  }

  return data.data;
};

const ensureCourse = async () => {
  let course = await StudentCourse.findOne().lean();
  if (!course) {
    const created = await StudentCourse.create(DEFAULT_COURSE);
    course = created.toObject();
  }
  return course;
};

const getProgressState = (profileSnapshot) => {
  const progress = profileSnapshot?.progressState;
  if (progress && typeof progress === 'object') return progress;
  return emptyProgressState;
};

const updateProgressSnapshot = async (userId, updater) => {
  const profile = await StudentProfile.findOne({ userId });
  const snapshot = profile?.snapshot && typeof profile.snapshot === 'object' ? profile.snapshot : {};
  const progressState = getProgressState(snapshot);
  const nextProgressState = updater(progressState);
  const nextSnapshot = {
    ...snapshot,
    progressState: nextProgressState,
    progressUpdatedAt: new Date().toISOString(),
  };
  const course = await ensureCourse();
  const learningXp = computeLearningXp(course.course || course, nextProgressState);
  const xpSummary = await buildXpSummary(
    userId,
    nextSnapshot?.activity?.visitDates || [],
    learningXp
  );
  await notifyXpAndRankIfChanged(userId, xpSummary, nextSnapshot);
  return { nextSnapshot, nextProgressState, xpSummary };
};

const computeModuleProgress = (module, progressState) => {
  const moduleProgress = progressState.modules?.[module.moduleId] || { rooms: {}, ctfCompleted: false };
  const totalRooms = module.rooms.length;
  const roomsCompleted = module.rooms.filter((room) => moduleProgress.rooms?.[room.roomId]).length;
  const ctfCompleted = Boolean(moduleProgress.ctfCompleted);
  const totalUnits = totalRooms + 1;
  const completedUnits = roomsCompleted + (ctfCompleted ? 1 : 0);
  const progress = totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return {
    roomsCompleted,
    totalRooms,
    ctfCompleted,
    progress,
  };
};

const computeModuleStatuses = (modules, progressState) => {
  let firstIncompleteIndex = modules.length - 1;
  for (let i = 0; i < modules.length; i += 1) {
    const module = modules[i];
    const stats = computeModuleProgress(module, progressState);
    if (!(stats.roomsCompleted === stats.totalRooms && stats.ctfCompleted)) {
      firstIncompleteIndex = i;
      break;
    }
  }

  return modules.map((module, index) => {
    const stats = computeModuleProgress(module, progressState);
    if (stats.roomsCompleted === stats.totalRooms && stats.ctfCompleted) return 'done';
    if (index === firstIncompleteIndex) {
      return stats.progress > 0 ? 'in-progress' : 'next';
    }
    return 'next';
  });
};

const buildOverviewFromCourse = (course, progressState) => {
  const modules = course.modules || [];
  const statuses = computeModuleStatuses(modules, progressState);
  let totalRooms = 0;
  let roomsCompleted = 0;
  let ctfsCompleted = 0;

  const learningPath = modules.map((module, index) => {
    const stats = computeModuleProgress(module, progressState);
    totalRooms += stats.totalRooms;
    roomsCompleted += stats.roomsCompleted;
    if (stats.ctfCompleted) ctfsCompleted += 1;

    return {
      id: module.moduleId,
      title: module.title,
      status: statuses[index],
      progress: stats.progress,
      roomsTotal: stats.totalRooms,
      roomsCompleted: stats.roomsCompleted,
    };
  });

  const totalModules = modules.length;
  const modulesCompleted = learningPath.filter((item) => item.status === 'done').length;
  const totalUnits = totalRooms + totalModules; // rooms + CTFs
  const completedUnits = roomsCompleted + ctfsCompleted;
  const overallProgress = totalUnits ? Math.round((completedUnits / totalUnits) * 100) : 0;

  return {
    learningPath,
    modules: modules.map((module) => {
      const stats = computeModuleProgress(module, progressState);
      return {
        id: module.moduleId,
        title: module.title,
        roomsTotal: stats.totalRooms,
        roomsCompleted: stats.roomsCompleted,
        ctf: module.ctf,
        badge: module.badge,
        progress: stats.progress,
      };
    }),
    snapshot: [
      { id: 'modules', label: 'Modules completed', value: String(modulesCompleted), icon: 'check' },
      { id: 'rooms', label: 'Rooms completed', value: String(roomsCompleted), icon: 'code' },
      { id: 'ctfs', label: 'CTFs completed', value: String(ctfsCompleted), icon: 'flag' },
      { id: 'progress', label: 'Overall progress', value: `${overallProgress}%`, icon: 'clock' },
    ],
  };
};

// GET /student/overview
router.get('/overview', async (req, res, next) => {
  try {
    const communityConfig = await CommunityConfig.findOne().select('stats channels').lean();
    const stats = communityConfig?.stats || {};
    const channels = communityConfig?.channels || [];
    const user = await User.findById(req.user.id).select('bootcampStatus bootcampPaymentStatus').lean();
    const xpSummary = await upsertVisitAndGetSummary(req.user.id);
    const isRegistered = user?.bootcampStatus !== 'not_enrolled';
    let overview = { learningPath: [], modules: [], snapshot: [] };

    if (isRegistered) {
      const course = await ensureCourse();
      const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
      const progressState = getProgressState(profile?.snapshot);
      overview = buildOverviewFromCourse(course.course || course, progressState);
    }
    res.json({
      learningPath: overview.learningPath || [],
      modules: overview.modules || [],
      snapshot: overview.snapshot || [],
      bootcampStatus: user?.bootcampStatus || 'not_enrolled',
      bootcampPaymentStatus: user?.bootcampPaymentStatus || 'unpaid',
      xpSummary,
      communityStats: {
        questions: Number(stats.questions || 0),
        answered: Number(stats.answered || 0),
        channels: Number(channels.length || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/learning-path', requireBootcampAccess, async (req, res, next) => {
  try {
    const course = await ensureCourse();
    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const overview = buildOverviewFromCourse(course.course || course, progressState);
    res.json(overview.learningPath || []);
  } catch (err) {
    next(err);
  }
});

router.get('/snapshot', requireBootcampRegistration, async (req, res, next) => {
  try {
    const course = await ensureCourse();
    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const overview = buildOverviewFromCourse(course.course || course, progressState);
    res.json(overview.snapshot || []);
  } catch (err) {
    next(err);
  }
});

// POST /student/bootcamp
router.post('/bootcamp', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.bootcampStatus !== 'completed') {
      user.bootcampStatus = 'enrolled';
      await user.save({ validateBeforeSave: false });
    }

    const application = req.body?.application && typeof req.body.application === 'object'
      ? req.body.application
      : null;

    if (application) {
      const profile = await StudentProfile.findOne({ userId: req.user.id });
      const snapshot = profile?.snapshot || {};
      const updatedSnapshot = {
        ...snapshot,
        bootcampApplication: {
          ...application,
          submittedAt: new Date().toISOString(),
        },
      };
      await StudentProfile.findOneAndUpdate(
        { userId: req.user.id },
        { $set: { snapshot: updatedSnapshot } },
        { upsert: true, new: true }
      );
    }

    res.json({
      bootcampStatus: user.bootcampStatus || 'enrolled',
      bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
    });
  } catch (err) {
    next(err);
  }
});

// POST /student/bootcamp/payments/initialize
router.post('/bootcamp/payments/initialize', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.bootcampStatus === 'not_enrolled') {
      return res.status(403).json({ error: 'Bootcamp registration required', code: 'bootcamp_registration_required' });
    }

    const method = String(req.body?.method || 'momo').toLowerCase();
    const channels = mapPaymentMethodToChannels(method);
    const reference = `bootcamp_${user._id.toString()}_${Date.now()}`;

    const paystackData = await initializePaystackTransaction({
      email: user.email,
      amount: BOOTCAMP_PRICE_GHS,
      reference,
      channels,
      metadata: {
        userId: user._id.toString(),
        method,
        purpose: 'bootcamp',
      },
    });

    await BootcampPayment.create({
      userId: user._id,
      provider: 'paystack',
      amount: BOOTCAMP_PRICE_GHS,
      currency: BOOTCAMP_CURRENCY,
      status: 'pending',
      reference,
      authorizationUrl: paystackData.authorization_url,
      metadata: paystackData,
    });

    user.bootcampPaymentStatus = 'pending';
    user.bootcampPaymentRef = reference;
    await user.save({ validateBeforeSave: false });

    res.json({
      authorizationUrl: paystackData.authorization_url,
      reference,
      accessCode: paystackData.access_code,
      amount: BOOTCAMP_PRICE_GHS,
      currency: BOOTCAMP_CURRENCY,
      bootcampPaymentStatus: user.bootcampPaymentStatus,
    });
  } catch (err) {
    next(err);
  }
});

// GET /student/bootcamp/payments/verify
router.get('/bootcamp/payments/verify', async (req, res, next) => {
  try {
    const reference = String(req.query?.reference || '').trim();
    if (!reference) return res.status(400).json({ error: 'Reference is required' });

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: 'Paystack secret key missing' });
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    if (!response.ok || !data.status) {
      return res.status(502).json({ error: data?.message || 'Payment verification failed' });
    }

    const transaction = data.data;
    const isSuccess = transaction?.status === 'success';
    const amountMatches = Number(transaction?.amount || 0) === Math.round(BOOTCAMP_PRICE_GHS * 100);
    const payment = await BootcampPayment.findOne({ reference }).sort({ createdAt: -1 });
    if (payment) {
      payment.status = isSuccess && amountMatches ? 'paid' : 'verification_failed';
      payment.metadata = { ...payment.metadata, verify: transaction };
      await payment.save({ validateBeforeSave: false });
    }

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (isSuccess && amountMatches) {
      user.bootcampPaymentStatus = 'paid';
      user.bootcampPaidAt = new Date();
      if (user.bootcampStatus === 'not_enrolled') {
        user.bootcampStatus = 'enrolled';
      }
      await user.save({ validateBeforeSave: false });
      const notice = await Notification.create({
        userId: user._id,
        type: 'payment_confirmed',
        title: 'Payment confirmed',
        message: 'Your bootcamp payment was successfully verified. Access unlocked.',
        metadata: { reference, amount: BOOTCAMP_PRICE_GHS, currency: BOOTCAMP_CURRENCY },
      });
      emitNotifications([notice]);
    } else {
      const notice = await Notification.create({
        userId: user._id,
        type: 'payment_failed',
        title: 'Payment verification failed',
        message: 'We could not verify your bootcamp payment. Please retry or contact support.',
        metadata: { reference, amount: BOOTCAMP_PRICE_GHS, currency: BOOTCAMP_CURRENCY },
      });
      emitNotifications([notice]);
    }

    res.json({
      bootcampPaymentStatus: user.bootcampPaymentStatus || 'unpaid',
      bootcampStatus: user.bootcampStatus || 'not_enrolled',
      bootcampPaidAt: user.bootcampPaidAt,
    });
  } catch (err) {
    next(err);
  }
});

// POST /student/bootcamp/payments/btc
router.post('/bootcamp/payments/btc', async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.bootcampStatus === 'not_enrolled') {
      return res.status(403).json({ error: 'Bootcamp registration required', code: 'bootcamp_registration_required' });
    }

    const txHash = String(req.body?.txHash || '').trim();
    if (!txHash) return res.status(400).json({ error: 'BTC transaction hash is required' });

    await BootcampPayment.create({
      userId: user._id,
      provider: 'btc',
      amount: BOOTCAMP_PRICE_GHS,
      currency: BOOTCAMP_CURRENCY,
      status: 'pending',
      txHash,
      metadata: {
        userId: user._id.toString(),
        purpose: 'bootcamp',
      },
    });

    user.bootcampPaymentStatus = 'pending';
    await user.save({ validateBeforeSave: false });

    res.json({
      bootcampPaymentStatus: user.bootcampPaymentStatus,
      bootcampStatus: user.bootcampStatus || 'enrolled',
    });
  } catch (err) {
    next(err);
  }
});

// GET /student/course
router.get('/course', requireBootcampAccess, async (_req, res, next) => {
  try {
    const course = await ensureCourse();
    res.json(course.course || course);
  } catch (err) {
    next(err);
  }
});

// GET /student/courses
router.get('/courses', requireBootcampAccess, async (_req, res, next) => {
  try {
    const course = await ensureCourse();
    res.json([course.course || course]);
  } catch (err) {
    next(err);
  }
});

// GET /student/course/progress
router.get('/course/progress', requireBootcampAccess, async (req, res, next) => {
  try {
    const course = await ensureCourse();
    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const overview = buildOverviewFromCourse(course.course || course, progressState);
    res.json({
      overall: overview.snapshot?.find((item) => item.id === 'progress')?.value || '0%',
      modules: overview.modules || [],
    });
  } catch (err) {
    next(err);
  }
});

// GET /student/learn/resources/free
router.get('/learn/resources/free', async (_req, res, next) => {
  try {
    const content = await SiteContent.findOne({ key: 'site' }).select('learn').lean();
    const resources = Array.isArray(content?.learn?.freeResources)
      ? content.learn.freeResources
      : [];

    res.json({
      items: resources.map((item, index) => ({
        id: String(index + 1),
        title: item.title || 'Untitled resource',
        description: item.description || '',
        url: item.url || '',
        type: item.type || 'link',
      })),
      message: content?.learn?.freeResourcesMessage || 'We do not have free resources yet.',
    });
  } catch (err) {
    next(err);
  }
});

// GET /student/xp-summary
router.get('/xp-summary', async (req, res, next) => {
  try {
    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const visitDates = profile?.snapshot?.activity?.visitDates || [];
    const progressState = getProgressState(profile?.snapshot);
    const course = await ensureCourse();
    const learningXp = computeLearningXp(course.course || course, progressState);
    const xpSummary = await buildXpSummary(req.user.id, visitDates, learningXp);
    res.json(xpSummary);
  } catch (err) {
    next(err);
  }
});

// POST /student/profile
// Direct snapshot updates are disabled for security. Use specific progress endpoints instead.
router.post('/profile', async (_req, res) => {
  res.status(405).json({ error: 'Direct profile updates are not allowed.' });
});

// POST /student/quiz
router.post('/quiz', requireBootcampAccess, async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (payload.type && payload.id) {
      const scope = { type: payload.type, id: payload.id, courseId: payload.courseId || '' };
      let quiz = await Quiz.findOne({ 'scope.type': scope.type, 'scope.id': scope.id, 'scope.courseId': scope.courseId }).lean();
      if (!quiz) {
        const created = await Quiz.create(buildDefaultQuiz(scope));
        quiz = created.toObject();
      }
      const scopeKey = `${scope.type}:${scope.id}:${scope.courseId || ''}`;
      const existingNotice = await Notification.findOne({
        userId: req.user.id,
        type: 'quiz_available',
        'metadata.scopeKey': scopeKey,
      }).lean();
      if (!existingNotice) {
        const notice = await Notification.create({
          userId: req.user.id,
          type: 'quiz_available',
          title: 'Quiz available',
          message: 'A new quiz is ready for you.',
          metadata: {
            scope,
            scopeKey,
          },
        });
        emitNotifications([notice]);
      }
      return res.json(quiz);
    }

    if (payload.scope && payload.answers && typeof payload.answers === 'object') {
      const scope = payload.scope || {};
      const quiz = await Quiz.findOne({
        'scope.type': scope.type,
        'scope.id': scope.id,
        'scope.courseId': scope.courseId || '',
      }).lean();
      if (!quiz) {
        return res.status(404).json({ error: 'Quiz not found' });
      }
      const answers = payload.answers || {};
      const total = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
      const correct = Array.isArray(quiz.questions)
        ? quiz.questions.reduce((acc, q) => {
            const answerIndex = answers[q.id];
            return acc + (answerIndex === q.correctIndex ? 1 : 0);
          }, 0)
        : 0;
      const score = total ? Math.round((correct / total) * 100) : 0;
      const passed = score >= 70;
      await QuizSubmission.create({
        userId: req.user.id,
        scope,
        score,
        total,
        correct,
        passed,
      });
      const resultNotice = await Notification.create({
        userId: req.user.id,
        type: 'quiz_result',
        title: 'Quiz result available',
        message: passed ? 'You passed the quiz.' : 'Quiz completed. Review your answers.',
        metadata: { scope, score, total, correct, passed },
      });
      emitNotifications([resultNotice]);
      return res.json({
        score,
        total,
        correct,
        passed,
      });
    }

    return res.status(400).json({ error: 'Invalid quiz payload' });
  } catch (err) {
    next(err);
  }
});

// POST /student/enroll-training
router.post('/enroll-training', requireBootcampAccess, async (req, res, next) => {
  try {
    const training = await enrollTraining(req.user.id, req.body || {});
    res.json(training);
  } catch (err) {
    next(err);
  }
});

// POST /student/modules/:moduleId/complete
router.post('/modules/:moduleId/complete', requireBootcampAccess, async (req, res, next) => {
  try {
    const course = await ensureCourse();
    const modules = course.course?.modules || course.modules || [];
    const moduleId = Number(req.params.moduleId);
    const module = modules.find((m) => Number(m.moduleId) === moduleId);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const moduleProgress = progressState.modules?.[moduleId] || { rooms: {}, ctfCompleted: false };
    const allRoomsCompleted =
      module.rooms.length > 0 &&
      module.rooms.every((room) => moduleProgress.rooms?.[room.roomId]);
    if (!allRoomsCompleted || !moduleProgress.ctfCompleted) {
      return res.status(400).json({ error: 'Complete all rooms and CTF before finishing module.' });
    }

    const result = await completeModule(req.user.id, req.params.moduleId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /student/modules/:moduleId/rooms/:roomId/complete
router.post('/modules/:moduleId/rooms/:roomId/complete', requireBootcampAccess, async (req, res, next) => {
  try {
    const course = await ensureCourse();
    const modules = course.course?.modules || course.modules || [];
    const moduleId = Number(req.params.moduleId);
    const roomId = Number(req.params.roomId);
    const module = modules.find((m) => Number(m.moduleId) === moduleId);
    if (!module) return res.status(404).json({ error: 'Module not found' });
    const room = (module.rooms || []).find((r) => Number(r.roomId) === roomId);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const { nextProgressState, xpSummary } = await updateProgressSnapshot(req.user.id, (progressState) => {
      const moduleProgress = progressState.modules?.[moduleId] || { rooms: {}, ctfCompleted: false };
      return {
        ...progressState,
        modules: {
          ...progressState.modules,
          [moduleId]: {
            ...moduleProgress,
            rooms: {
              ...moduleProgress.rooms,
              [roomId]: true,
            },
          },
        },
      };
    });

    res.json({ success: true, progressState: nextProgressState, xpSummary });
  } catch (err) {
    next(err);
  }
});

// POST /student/modules/:moduleId/ctf/complete
router.post('/modules/:moduleId/ctf/complete', requireBootcampAccess, async (req, res, next) => {
  try {
    const course = await ensureCourse();
    const modules = course.course?.modules || course.modules || [];
    const moduleId = Number(req.params.moduleId);
    const module = modules.find((m) => Number(m.moduleId) === moduleId);
    if (!module) return res.status(404).json({ error: 'Module not found' });

    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const moduleProgress = progressState.modules?.[moduleId] || { rooms: {}, ctfCompleted: false };
    const allRoomsCompleted =
      module.rooms.length > 0 &&
      module.rooms.every((room) => moduleProgress.rooms?.[room.roomId]);
    if (!allRoomsCompleted) {
      return res.status(400).json({ error: 'Complete all rooms before finishing the CTF.' });
    }

    const { nextProgressState, xpSummary } = await updateProgressSnapshot(req.user.id, (state) => ({
      ...state,
      modules: {
        ...state.modules,
        [moduleId]: {
          ...(state.modules?.[moduleId] || { rooms: {}, ctfCompleted: false }),
          ctfCompleted: true,
        },
      },
    }));

    res.json({ success: true, progressState: nextProgressState, xpSummary });
  } catch (err) {
    next(err);
  }
});

// POST /student/ctf/:ctfId/complete
router.post('/ctf/:ctfId/complete', requireBootcampAccess, async (req, res, next) => {
  try {
    const ctfId = String(req.params.ctfId || '').trim();
    const course = await ensureCourse();
    const modules = course.course?.modules || course.modules || [];
    const module = modules.find((m) =>
      String(m.ctf || '').toLowerCase() === ctfId.toLowerCase() ||
      String(m.moduleId) === ctfId
    );
    if (!module) return res.status(404).json({ error: 'CTF not found' });

    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const moduleProgress = progressState.modules?.[module.moduleId] || { rooms: {}, ctfCompleted: false };
    const allRoomsCompleted =
      module.rooms.length > 0 &&
      module.rooms.every((room) => moduleProgress.rooms?.[room.roomId]);
    if (!allRoomsCompleted) {
      return res.status(400).json({ error: 'Complete all rooms before finishing the CTF.' });
    }

    const { nextProgressState, xpSummary } = await updateProgressSnapshot(req.user.id, (state) => ({
      ...state,
      modules: {
        ...state.modules,
        [module.moduleId]: {
          ...(state.modules?.[module.moduleId] || { rooms: {}, ctfCompleted: false }),
          ctfCompleted: true,
        },
      },
    }));

    res.json({ success: true, progressState: nextProgressState, xpSummary });
  } catch (err) {
    next(err);
  }
});

// POST /student/community/join
router.post('/community/join', async (req, res, next) => {
  try {
    const result = await joinCommunity(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /student/engagements/supervised
router.get('/engagements/supervised', async (req, res, next) => {
  try {
    const result = await listSupervisedEngagements(req.user.id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /student/skill-refresh
router.post('/skill-refresh', async (req, res, next) => {
  try {
    const result = await refreshSkills(req.user.id, req.body || {});
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /student/deployment
router.post('/deployment', async (req, res, next) => {
  try {
    const result = await deployProfessional(req.user.id, req.body || {});
    if (!result) return res.status(404).json({ error: 'User not found' });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
