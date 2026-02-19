/**
 * Student Routes
 * Matches frontend API_ENDPOINTS.STUDENT
 */
import { Router } from 'express';
import {
  Quiz,
  QuizSubmission,
  StudentCourse,
  StudentOverview,
  StudentProfile,
} from '../models/index.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

const DEFAULT_OVERVIEW = {
  learningPath: [
    { id: 'net', title: 'Networking Basics', status: 'done', progress: 100 },
    { id: 'linux', title: 'Linux Essentials', status: 'in-progress', progress: 65 },
    { id: 'web', title: 'Web Security', status: 'next', progress: 0 },
  ],
  challenges: [
    { id: 'sql', title: 'SQL Injection 101', level: 'Easy', time: '35 min', icon: 'target' },
    { id: 'jwt', title: 'JWT Misconfig', level: 'Medium', time: '50 min', icon: 'shield' },
    { id: 'phish', title: 'Phishing Analysis', level: 'Easy', time: '25 min', icon: 'flag' },
  ],
  mentors: [
    { id: 'nia', name: 'Nia T.', focus: 'Blue Team', status: 'Available' },
    { id: 'sam', name: 'Sam K.', focus: 'Web Pentest', status: 'Busy' },
  ],
  snapshot: [
    { id: 'lessons', label: 'Lessons completed', value: '18', icon: 'check' },
    { id: 'time', label: 'Time spent', value: '12h', icon: 'clock' },
    { id: 'labs', label: 'Labs passed', value: '7', icon: 'lock' },
    { id: 'ctfs', label: 'CTFs completed', value: '3', icon: 'code' },
  ],
};

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

const ensureOverview = async (userId) => {
  let overview = await StudentOverview.findOne({ userId }).lean();
  if (!overview) {
    const created = await StudentOverview.create({ userId, ...DEFAULT_OVERVIEW });
    overview = created.toObject();
  }
  return overview;
};

const ensureCourse = async () => {
  let course = await StudentCourse.findOne().lean();
  if (!course) {
    const created = await StudentCourse.create(DEFAULT_COURSE);
    course = created.toObject();
  }
  return course;
};

// GET /student/overview
router.get('/overview', async (req, res, next) => {
  try {
    const overview = await ensureOverview(req.user.id);
    res.json({
      learningPath: overview.learningPath || [],
      challenges: overview.challenges || [],
      mentors: overview.mentors || [],
      snapshot: overview.snapshot || [],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/learning-path', async (req, res, next) => {
  try {
    const overview = await ensureOverview(req.user.id);
    res.json(overview.learningPath || []);
  } catch (err) {
    next(err);
  }
});

router.get('/challenges', async (req, res, next) => {
  try {
    const overview = await ensureOverview(req.user.id);
    res.json(overview.challenges || []);
  } catch (err) {
    next(err);
  }
});

router.get('/mentors', async (req, res, next) => {
  try {
    const overview = await ensureOverview(req.user.id);
    res.json(overview.mentors || []);
  } catch (err) {
    next(err);
  }
});

router.get('/snapshot', async (req, res, next) => {
  try {
    const overview = await ensureOverview(req.user.id);
    res.json(overview.snapshot || []);
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
