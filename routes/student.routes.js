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
  User,
} from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

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
    const course = await ensureCourse();
    const profile = await StudentProfile.findOne({ userId: req.user.id }).lean();
    const progressState = getProgressState(profile?.snapshot);
    const overview = buildOverviewFromCourse(course.course || course, progressState);
    const communityConfig = await CommunityConfig.findOne().select('stats channels').lean();
    const stats = communityConfig?.stats || {};
    const channels = communityConfig?.channels || [];
    const user = await User.findById(req.user.id).select('bootcampStatus').lean();
    res.json({
      learningPath: overview.learningPath || [],
      modules: overview.modules || [],
      snapshot: overview.snapshot || [],
      bootcampStatus: user?.bootcampStatus || 'not_enrolled',
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

router.get('/learning-path', async (req, res, next) => {
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

router.get('/snapshot', async (req, res, next) => {
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

    res.json({ bootcampStatus: user.bootcampStatus || 'enrolled' });
  } catch (err) {
    next(err);
  }
});

// GET /student/course
router.get('/course', async (_req, res, next) => {
  try {
    const course = await ensureCourse();
    res.json(course.course || course);
  } catch (err) {
    next(err);
  }
});

// POST /student/profile
router.post('/profile', async (req, res, next) => {
  try {
    const snapshot = req.body || {};
    const doc = await StudentProfile.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { snapshot } },
      { upsert: true, new: true }
    ).lean();
    res.json({ success: true, data: doc.snapshot || snapshot });
  } catch (err) {
    next(err);
  }
});

// POST /student/quiz
router.post('/quiz', async (req, res, next) => {
  try {
    const payload = req.body || {};
    if (payload.type && payload.id) {
      const scope = { type: payload.type, id: payload.id, courseId: payload.courseId || '' };
      let quiz = await Quiz.findOne({ 'scope.type': scope.type, 'scope.id': scope.id, 'scope.courseId': scope.courseId }).lean();
      if (!quiz) {
        const created = await Quiz.create(buildDefaultQuiz(scope));
        quiz = created.toObject();
      }
      return res.json(quiz);
    }

    if (payload.scope && typeof payload.score === 'number') {
      const total = Number(payload.total || 0);
      const correct = Number(payload.correct || 0);
      const score = Number(payload.score || 0);
      const passed = score >= 70;
      await QuizSubmission.create({
        userId: req.user.id,
        scope: payload.scope,
        score,
        total,
        correct,
        passed,
      });
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

export default router;
