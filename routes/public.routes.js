/**
 * Public Routes
 * No auth required
 */
import { Router } from 'express';
import { Audit, CommunityConfig, Pentest, User } from '../models/index.js';

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

export default router;
