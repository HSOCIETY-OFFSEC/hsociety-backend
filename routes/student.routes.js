/**
 * Student Routes
 * Matches frontend API_ENDPOINTS.STUDENT
 */
import { Router } from 'express';

const router = Router();

const mockLearningPath = [
  { id: 'net', title: 'Networking Basics', status: 'done', progress: 100 },
  { id: 'linux', title: 'Linux Essentials', status: 'in-progress', progress: 65 },
  { id: 'web', title: 'Web Security', status: 'next', progress: 0 }
];

const mockChallenges = [
  { id: 'sql', title: 'SQL Injection 101', level: 'Easy', time: '35 min', icon: 'target' },
  { id: 'jwt', title: 'JWT Misconfig', level: 'Medium', time: '50 min', icon: 'shield' },
  { id: 'phish', title: 'Phishing Analysis', level: 'Easy', time: '25 min', icon: 'flag' }
];

const mockMentors = [
  { id: 'nia', name: 'Nia T.', focus: 'Blue Team', status: 'Available' },
  { id: 'sam', name: 'Sam K.', focus: 'Web Pentest', status: 'Busy' }
];

const mockSnapshot = [
  { id: 'lessons', label: 'Lessons completed', value: '18', icon: 'check' },
  { id: 'time', label: 'Time spent', value: '12h', icon: 'clock' },
  { id: 'labs', label: 'Labs passed', value: '7', icon: 'lock' },
  { id: 'ctfs', label: 'CTFs completed', value: '3', icon: 'code' }
];

router.get('/overview', (req, res) => {
  res.json({
    learningPath: mockLearningPath,
    challenges: mockChallenges,
    mentors: mockMentors,
    snapshot: mockSnapshot
  });
});

router.get('/learning-path', (req, res) => {
  res.json(mockLearningPath);
});

router.get('/challenges', (req, res) => {
  res.json(mockChallenges);
});

router.get('/mentors', (req, res) => {
  res.json(mockMentors);
});

router.get('/snapshot', (req, res) => {
  res.json(mockSnapshot);
});

export default router;
